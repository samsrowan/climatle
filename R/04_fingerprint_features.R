# 04_fingerprint_features.R — Per-country distinctiveness features + contrast neighbor
#
# Builds the structured input that the LLM will later paraphrase into the
# one-sentence "fingerprint" shown on the result screen.
#
# Depends on objects from 01_load_and_process.R + 02_compute_similarities.R:
#   country_meta, ghg, ember, trajectory_matrix, S_ghg, S_energy, S_trajectory
#
# Output: writes json/fingerprint_inputs.json with one entry per country, each
# carrying (a) its top distinctive features and (b) a contrast neighbor.

library(tidyverse)
library(jsonlite)

# ── Helpers ──────────────────────────────────────────────────────────────────

# Percentile rank in [0, 1], NA-safe, ties → average rank.
pct_rank <- function(x) rank(x, ties.method = "average", na.last = "keep") / sum(!is.na(x))

# Directional distinctiveness score in [0, 1].
#  high → 1 when value is at the top of the distribution
#  low  → 1 when value is at the bottom
#  both → 1 when value is far from the median in either direction
distinctiveness <- function(pct, direction) {
  if (is.na(pct)) return(NA_real_)
  switch(direction,
         high = pct,
         low  = 1 - pct,
         both = abs(pct - 0.5) * 2)
}

# ── 1. Sectoral features ─────────────────────────────────────────────────────

sector_wide <- ghg %>%
  select(iso3c, subsector_short, share_subsector) %>%
  pivot_wider(names_from = subsector_short, values_from = share_subsector, values_fill = 0)

sector_totals <- ghg %>%
  group_by(iso3c, sector_title) %>%
  summarise(sector_share = sum(share_subsector), .groups = "drop") %>%
  pivot_wider(names_from = sector_title, values_from = sector_share, values_fill = 0) %>%
  rename(sec_afolu = AFOLU, sec_buildings = Buildings,
         sec_energy = `Energy systems`, sec_industry = Industry,
         sec_transport = Transport)

subsector_picks <- sector_wide %>%
  transmute(
    iso3c,
    sub_rice        = afolu_rice,
    sub_enteric     = afolu_enteric_fermentation,
    sub_cement      = industry_cement,
    sub_petro_state = energy_oil_and_gas_fugitive + energy_petroleum_refining,
    sub_elec_heat   = energy_electricity_and_heat,
    sub_waste       = industry_waste,
    sub_road        = transport_road
  )

# ── 2. Energy-mix features (ember is in percent: 0-100) ──────────────────────

ember_df <- ember %>%
  as.data.frame() %>% rownames_to_column("iso3c") %>%
  rename_with(~ paste0("e_", .x), -iso3c) %>%
  rename(e_other_fossil = e_fossil_other, e_other_renew = e_renewables_other) %>%
  mutate(e_solar_wind = e_solar + e_wind)

# ── 3. Trajectory shape features ─────────────────────────────────────────────

mat_year <- function(y) trajectory_matrix[, paste0("y", y)]

# Soviet drop: max 5-yr decline in windows starting 1990-1995
soviet_drops <- sapply(0:5, function(i) {
  s <- mat_year(1990 + i); e <- mat_year(1995 + i)
  pmax(0, (s - e) / pmax(s, 1e-6))
})

# Most recent dip: 2024 vs max(2020-2024)
recent_max <- apply(trajectory_matrix[, paste0("y", 2020:2024)], 1, max, na.rm = TRUE)

years_col <- as.numeric(sub("^y", "", colnames(trajectory_matrix)))
peak_year_per_iso <- years_col[apply(trajectory_matrix, 1, which.max)]

traj_features <- tibble(
  iso3c             = rownames(trajectory_matrix),
  t_ratio_2024_1990 = mat_year(2024) / 100,            # index is 1990=100
  t_soviet_drop     = apply(soviet_drops, 1, max, na.rm = TRUE),
  t_post_2020_dip   = mat_year(2024) / recent_max,     # 1 = no dip; <1 = dip
  t_peak_year       = peak_year_per_iso
)

# ── 3b. NDC features ─────────────────────────────────────────────────────────
# Percent change from 2021 emissions to the 2030 NDC target. Captures both
# direction (growth allowed vs. declines required) and magnitude (flat vs.
# steep). We use 2021 as the anchor because it's the COP26 baseline and the
# NDC submissions are aligned with that.

emissions_2021 <- trajectory %>%
  filter(year == 2021) %>%
  select(iso3c, e2021 = ghg_observed)

ndc_targets <- trajectory %>%
  distinct(iso3c, ndc2_absolute_uncond, ndc2_absolute_cond)

ndc_features <- ndc_targets %>%
  left_join(emissions_2021, by = "iso3c") %>%
  transmute(
    iso3c,
    ndc_change_uncond = if_else(!is.na(ndc2_absolute_uncond) & !is.na(e2021) & e2021 > 0,
                                (ndc2_absolute_uncond - e2021) / e2021, NA_real_),
    ndc_change_cond   = if_else(!is.na(ndc2_absolute_cond)   & !is.na(e2021) & e2021 > 0,
                                (ndc2_absolute_cond   - e2021) / e2021, NA_real_)
  )

# ── 4. Join all features ─────────────────────────────────────────────────────

features <- country_meta %>%
  select(iso3c, country) %>%
  left_join(traj_features, by = "iso3c") %>%
  left_join(subsector_picks, by = "iso3c") %>%
  left_join(ember_df, by = "iso3c") %>%
  left_join(sector_totals, by = "iso3c") %>%
  left_join(ndc_features, by = "iso3c")

# ── 5. Feature catalog with directions ───────────────────────────────────────

# `group` is used for de-duplication: when two features in the top list belong
# to the same group, we keep only the higher-scoring one (avoids redundant
# Soviet-collapse + 1990-peak pairs, AFOLU-total + rice subsector, etc.).
feature_specs <- tribble(
  ~col,                   ~direction, ~group,        ~label,
  "t_ratio_2024_1990",    "both",     "trajectory",  "trajectory growth ratio (2024 / 1990)",
  "t_soviet_drop",        "high",     "soviet",      "sharp 5-yr drop in the 1990-95 window",
  "t_post_2020_dip",      "low",      "trajectory",  "recent dip (post-2020)",
  "t_peak_year",          "both",     "soviet",      "year of peak emissions",
  "ndc_change_uncond",    "both",     "ndc",         "NDC2 unconditional target — % change from 2021 emissions",
  "ndc_change_cond",      "both",     "ndc",         "NDC2 conditional target — % change from 2021 emissions",
  "sub_rice",             "high",     "afolu",       "rice cultivation share of GHG",
  "sub_enteric",          "high",     "afolu",       "enteric fermentation share (livestock)",
  "sec_afolu",            "high",     "afolu",       "AFOLU (agriculture & land use) share of GHG",
  "sub_cement",           "high",     "industry",    "cement share of GHG",
  "sub_petro_state",      "high",     "industry",    "oil & gas extraction + refining share",
  "sub_waste",            "high",     "industry",    "waste share of GHG",
  "sec_industry",         "low",      "industry",    "industry share of GHG (low = undeveloped signal)",
  "sub_elec_heat",        "high",     "electrical",  "electricity & heat share",
  "e_hydro",              "high",     "power_hydro", "hydro share of electricity",
  "e_nuclear",            "high",     "power_nuc",   "nuclear share of electricity",
  "e_coal",               "high",     "power_coal",  "coal share of electricity",
  "e_gas",                "high",     "power_gas",   "gas share of electricity",
  "e_other_fossil",       "high",     "power_oil",   "oil / other-fossil share of electricity",
  "e_solar_wind",         "high",     "power_vre",   "solar+wind share of electricity",
  "e_bioenergy",          "high",     "power_bio",   "bioenergy share of electricity",
  "e_other_renew",        "high",     "power_geo",   "other-renewables (e.g. geothermal) share"
)

# ── 6. Compute distinctiveness + discrimination scores per (country, feature) ─

# Percentile ranks across the playable set
feat_pcts <- features %>%
  mutate(across(all_of(feature_specs$col), pct_rank, .names = "{.col}_pct"))

# Discrimination score: how different is this country's percentile from the
# MEDIAN OF ITS SAME-REGION SIBLINGS. High = the feature separates the country
# from its regional cluster. We use region instead of similarity-based
# neighbors because players reason regionally: "this is post-Soviet" first,
# then "what makes it Russia vs. Ukraine."

regions <- read_csv("data/regions.csv", show_col_types = FALSE) %>%
  select(iso3c, region_sr)
region_of <- setNames(regions$region_sr, regions$iso3c)

iso_index <- setNames(seq_along(feat_pcts$iso3c), feat_pcts$iso3c)

same_region_siblings <- function(iso) {
  r <- region_of[iso]
  if (is.na(r)) return(character(0))
  setdiff(names(region_of)[region_of == r], iso)
}

discrimination_score <- function(iso, col_pct_name) {
  my_pct <- feat_pcts[[col_pct_name]][iso_index[iso]]
  if (is.na(my_pct)) return(NA_real_)
  sibs <- same_region_siblings(iso)
  sib_idx <- iso_index[sibs]
  sib_idx <- sib_idx[!is.na(sib_idx)]
  if (length(sib_idx) == 0) return(0)
  nbr_pcts <- feat_pcts[[col_pct_name]][sib_idx]
  abs(my_pct - median(nbr_pcts, na.rm = TRUE))
}

# Long: one row per (iso3c, feature, value, pct, ...).
features_long <- map_dfr(seq_len(nrow(feature_specs)), function(i) {
  spec <- feature_specs[i, ]
  col_name <- spec$col
  pct_col  <- paste0(col_name, "_pct")
  tibble(
    iso3c     = feat_pcts$iso3c,
    country   = feat_pcts$country,
    col       = col_name,
    label     = spec$label,
    direction = spec$direction,
    group     = spec$group,
    value     = feat_pcts[[col_name]],
    pct       = feat_pcts[[pct_col]],
    disc      = vapply(feat_pcts$iso3c, function(iso) discrimination_score(iso, pct_col),
                       numeric(1), USE.NAMES = FALSE)
  )
}) %>%
  mutate(
    distinct_score = map2_dbl(pct, direction, distinctiveness),
    # Combined score weighs distinctiveness and discrimination equally.
    # A great fingerprint feature is one that's both unusual globally AND
    # different from the country's siblings.
    score = (distinct_score + disc) / 2
  )

# Top N features per country, de-duplicated by group: walk in combined-score
# order and keep a feature only if its group hasn't already been claimed by a
# higher-scoring feature for the same country.
pick_top_dedup <- function(df, n = 5) {
  df <- df %>% arrange(desc(score))
  seen_groups <- character(0)
  keep <- logical(nrow(df))
  for (i in seq_len(nrow(df))) {
    g <- df$group[i]
    if (is.na(df$score[i]) || df$score[i] == 0) next
    if (!(g %in% seen_groups)) {
      keep[i] <- TRUE
      seen_groups <- c(seen_groups, g)
      if (sum(keep) >= n) break
    }
  }
  df[keep, ]
}

top_features <- features_long %>%
  group_by(iso3c, country) %>%
  group_modify(~ pick_top_dedup(.x, n = 5)) %>%
  ungroup() %>%
  arrange(iso3c, desc(score))

# ── 7. Contrast neighbor (region-restricted) ─────────────────────────────────
# For each country: find a country C' in the SAME SR region, similar on two of
# (sector, energy, traj) but different on the third. Restricting to same-region
# keeps the comparison meaningful for players — pairing Iceland with the Central
# African Republic on "energy similarity" is mathematically valid but useless
# as a player reference point. (regions/region_of already loaded above.)

DIM_NAMES <- c("sector", "energy", "trajectory")

find_contrast <- function(iso, hi = 0.75, lo = 0.5) {
  my_region <- region_of[iso]
  # Restrict to same region; if region is unknown, fall back to all.
  if (!is.na(my_region)) {
    same_region_isos <- names(region_of)[region_of == my_region]
    candidates <- intersect(setdiff(rownames(S_ghg), iso), same_region_isos)
  } else {
    candidates <- setdiff(rownames(S_ghg), iso)
  }
  if (length(candidates) == 0) {
    return(list(contrast_iso = NA_character_, diverges_on = NA_character_,
                shared_low = NA_real_, shared_mid = NA_real_, shared_hi = NA_real_,
                type = "no_candidates"))
  }
  sims <- cbind(
    sector     = S_ghg[iso, candidates],
    energy     = S_energy[iso, candidates],
    trajectory = S_trajectory[iso, candidates]
  )
  # Single-candidate edge case: matrix indexing collapses to a vector
  if (length(candidates) == 1) sims <- matrix(sims, nrow = 1, dimnames = list(candidates, DIM_NAMES))
  # For each candidate: sorted sims (ascending), top-2 mean, gap = mid-low
  sorted <- t(apply(sims, 1, sort))
  mid_lo_gap <- sorted[, 2] - sorted[, 1]
  qualifies  <- sorted[, 2] >= hi & sorted[, 1] <= lo
  diverges_idx <- apply(sims, 1, which.min)
  diverges_on  <- DIM_NAMES[diverges_idx]

  qual_idx <- which(qualifies)
  if (length(qual_idx) > 0) {
    best <- qual_idx[which.max(mid_lo_gap[qual_idx])]
    list(contrast_iso = candidates[best],
         diverges_on  = diverges_on[best],
         shared_low   = sorted[best, 1],
         shared_mid   = sorted[best, 2],
         shared_hi    = sorted[best, 3],
         type         = "asymmetric")
  } else {
    # Fallback: closest country by mean of three sims
    avg <- rowMeans(sims)
    best <- which.max(avg)
    list(contrast_iso = candidates[best],
         diverges_on  = NA_character_,
         shared_low   = sorted[best, 1],
         shared_mid   = sorted[best, 2],
         shared_hi    = sorted[best, 3],
         type         = "closest_overall")
  }
}

contrasts <- map_dfr(iso_play, function(iso) {
  res <- find_contrast(iso)
  tibble(iso3c = iso,
         contrast_iso         = res$contrast_iso,
         contrast_diverges_on = res$diverges_on,
         contrast_low_sim     = round(res$shared_low, 3),
         contrast_mid_sim     = round(res$shared_mid, 3),
         contrast_hi_sim      = round(res$shared_hi,  3),
         contrast_type        = res$type)
})

# Add the contrast country's name
iso_to_name <- setNames(country_meta$country, country_meta$iso3c)
contrasts$contrast_name <- iso_to_name[contrasts$contrast_iso]

# ── 8. Bundle for export ─────────────────────────────────────────────────────

fingerprint_inputs <- top_features %>%
  group_by(iso3c, country) %>%
  summarise(
    distinctive_features = list(tibble(
      feature        = label,
      value          = round(value, 3),
      percentile     = round(pct, 3),
      direction      = direction,
      # Two scores: distinctiveness (rare globally) and discrimination
      # (different from this country's nearest neighbors). The LLM weighs both.
      distinctive    = round(distinct_score, 3),
      discriminating = round(disc, 3)
    )),
    .groups = "drop"
  ) %>%
  left_join(contrasts, by = "iso3c")

# Convert to per-country named list for easier reading downstream
fp_list <- fingerprint_inputs %>%
  pmap(function(iso3c, country, distinctive_features,
               contrast_iso, contrast_diverges_on,
               contrast_low_sim, contrast_mid_sim, contrast_hi_sim,
               contrast_type, contrast_name) {
    list(
      name   = country,
      region = unname(region_of[iso3c]),     # SR region for regional context
      distinctive_features = distinctive_features,
      contrast = list(
        country      = contrast_name,
        iso3c        = contrast_iso,
        type         = contrast_type,
        diverges_on  = contrast_diverges_on,
        sim_low      = contrast_low_sim,
        sim_mid      = contrast_mid_sim,
        sim_high     = contrast_hi_sim
      )
    )
  }) %>%
  setNames(fingerprint_inputs$iso3c)

write_json(fp_list, "json/fingerprint_inputs.json",
           pretty = TRUE, auto_unbox = TRUE, null = "null")

cat("Wrote json/fingerprint_inputs.json — ", length(fp_list), " countries\n", sep = "")

# Surface how many countries got asymmetric vs. closest-overall contrasts
contrast_summary <- contrasts %>% count(contrast_type)
print(contrast_summary)
