# 03_export_json.R — Export all JSON files for the web app
# Requires: objects from 01 + 02

library(jsonlite)

dir.create("json", showWarnings = FALSE)

# ── 1. countries.json — master country list ───────────────────────────────────
countries_json <- country_meta %>%
  transmute(
    iso3c,
    name = country,
    gdp_pc = round(gdp_capita, 0),
    ghg_pc = round(ghg_capita, 2),
    pop = population,
    lat = round(lat, 2),
    lon = round(lon, 2)
  ) %>%
  arrange(name)

write_json(countries_json, "json/countries.json", pretty = TRUE, auto_unbox = TRUE)
cat("Wrote json/countries.json —", nrow(countries_json), "countries\n")

# ── 2. ghg_sectors.json — sectoral shares for bar charts ─────────────────────
ghg_sectors <- ghg %>%
  group_by(iso3c) %>%
  group_split() %>%
  set_names(map_chr(., ~ .x$iso3c[1])) %>%
  map(function(df) {
    list(
      sector_labels = sort(unique(df$sector_title)),
      subsectors = df %>%
        transmute(
          subsector_short,
          label = subsector_short %>%
            str_replace("^[^_]+_", "") %>%
            str_replace_all("_", " ") %>%
            str_to_title(),
          sector = sector_title,
          share = round(share_subsector, 4)
        ) %>%
        arrange(subsector_short) %>%
        purrr::transpose()
    )
  })

write_json(ghg_sectors, "json/ghg_sectors.json", pretty = TRUE, auto_unbox = TRUE)
cat("Wrote json/ghg_sectors.json\n")

# ── 3. energy_mix.json — electricity source shares ───────────────────────────
fossil_sources <- c("coal", "gas", "fossil_other")

energy_mix <- ember %>%
  as.data.frame() %>%
  rownames_to_column("iso3c") %>%
  pivot_longer(-iso3c, names_to = "source", values_to = "share") %>%
  mutate(type = if_else(source %in% fossil_sources, "Fossil", "Clean"),
         source = str_replace(source, "fossil_other", "Other Fossil"),
         source = str_replace(source, "renewables_other", "Other Renewables"),
         source = str_to_title(source),
         share = round(share / 100, 4)) %>%
  group_by(iso3c) %>%
  group_split() %>%
  set_names(map_chr(., ~ .x$iso3c[1])) %>%
  map(function(df) {
    list(sources = df %>%
           select(source, share, type) %>%
           purrr::transpose())
  })

write_json(energy_mix, "json/energy_mix.json", pretty = TRUE, auto_unbox = TRUE)
cat("Wrote json/energy_mix.json\n")

# ── 4. emissions_trajectory.json — time-series + NDC points ──────────────────
emissions_traj <- trajectory %>%
  filter(!is.na(ghg_observed)) %>%
  group_by(iso3c) %>%
  group_split() %>%
  set_names(map_chr(., ~ .x$iso3c[1])) %>%
  map(function(df) {
    ndc_uncond <- df$ndc2_absolute_uncond[1]
    ndc_cond   <- df$ndc2_absolute_cond[1]
    list(
      years     = df$year,
      emissions = round(df$ghg_observed, 2),
      ndc2_uncond = if (is.na(ndc_uncond)) NULL else round(ndc_uncond, 2),
      ndc2_cond   = if (is.na(ndc_cond))   NULL else round(ndc_cond, 2)
    )
  })

write_json(emissions_traj, "json/emissions_trajectory.json",
           pretty = TRUE, auto_unbox = TRUE, null = "null")
cat("Wrote json/emissions_trajectory.json\n")

# ── 5. sim_ghg.json — sectoral similarity matrix ────────────────────────────
sim_ghg_list <- S_ghg %>%
  as.data.frame() %>%
  rownames_to_column("from") %>%
  pivot_longer(-from, names_to = "to", values_to = "sim") %>%
  filter(from != to) %>%
  mutate(sim = round(sim, 4)) %>%
  group_by(from) %>%
  group_split() %>%
  set_names(map_chr(., ~ .x$from[1])) %>%
  map(~ as.list(set_names(.x$sim, .x$to)))

write_json(sim_ghg_list, "json/sim_ghg.json", pretty = TRUE, auto_unbox = TRUE)
cat("Wrote json/sim_ghg.json\n")

# ── 6. sim_energy.json — electricity similarity matrix ───────────────────────
sim_energy_list <- S_energy %>%
  as.data.frame() %>%
  rownames_to_column("from") %>%
  pivot_longer(-from, names_to = "to", values_to = "sim") %>%
  filter(from != to) %>%
  mutate(sim = round(sim, 4)) %>%
  group_by(from) %>%
  group_split() %>%
  set_names(map_chr(., ~ .x$from[1])) %>%
  map(~ as.list(set_names(.x$sim, .x$to)))

write_json(sim_energy_list, "json/sim_energy.json", pretty = TRUE, auto_unbox = TRUE)
cat("Wrote json/sim_energy.json\n")

# ── 7. centroids.json — lat/lon per country ──────────────────────────────────
centroids_list <- country_meta %>%
  select(iso3c, lat, lon) %>%
  mutate(lat = round(lat, 2), lon = round(lon, 2)) %>%
  group_by(iso3c) %>%
  group_split() %>%
  set_names(map_chr(., ~ .x$iso3c[1])) %>%
  map(~ list(lat = .x$lat, lon = .x$lon))

write_json(centroids_list, "json/centroids.json", pretty = TRUE, auto_unbox = TRUE)
cat("Wrote json/centroids.json\n")

cat("\nPipeline step 3 complete. All JSON exported to json/\n")
