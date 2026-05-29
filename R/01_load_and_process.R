# 01_load_and_process.R — Load raw data and build game-ready objects
# Run from project root: climate_game/

library(tidyverse)
library(readxl)
library(countrycode)

# ── 1A: Country universe ─────────────────────────────────────────────────────

ndc_raw <- read_csv("data/ghg_ndc_mini.csv", show_col_types = FALSE)

centroids_raw <- read_csv("data/centroids.csv", show_col_types = FALSE) %>%
  select(lon = longitude, lat = latitude, iso2c = ISO) %>%
  mutate(iso3c = countrycode(iso2c, "iso2c", "iso3c")) %>%
  filter(!is.na(iso3c)) %>%
  group_by(iso3c) %>%
  summarise(lat = mean(lat), lon = mean(lon), .groups = "drop")

# Country-level metadata (latest year with actual data per country)
country_meta <- ndc_raw %>%
  filter(!is.na(gdp_capita), !is.na(ghg_capita), !is.na(population)) %>%
  group_by(iso3c) %>%
  filter(year == max(year)) %>%
  slice(1) %>%
  ungroup() %>%
  select(iso3c, country, population, gdp_market, gdp_capita, ghg_capita,
         ndc2_absolute_uncond, ndc2_absolute_cond) %>%
  left_join(centroids_raw, by = "iso3c")

# ── 1B: Sectoral GHG emissions ───────────────────────────────────────────────

ghg_raw <- read_excel("data/essd_ghg_data_edgar_v7_gwp100_ar6.xlsx",
                      sheet = "data") %>%
  select(iso3c = iso, country, year, sector_title, subsector_title,
         CO2, CH4, N2O, Fgas, GHG)

# Use 2021 (latest year in EDGAR v7 sectoral data)
ghg_year <- 2021

cat("GHG sectoral data: using year", ghg_year, "\n")

ghg_filtered <- ghg_raw %>%
  filter(year == ghg_year) %>%
  group_by(iso3c, country, sector_title, subsector_title) %>%
  summarise(ghg = sum(GHG, na.rm = TRUE), .groups = "drop")

# Subsector short labels (from existing mapping)
ghg <- ghg_filtered %>%
  mutate(subsector_short = case_when(
    subsector_title == "Enteric Fermentation (CH4)"             ~ "afolu_enteric_fermentation",
    subsector_title == "Managed soils and pasture (CO2, N2O)"   ~ "afolu_managed_soils",
    subsector_title == "Manure management (N2O, CH4)"           ~ "afolu_manure",
    subsector_title == "Biomass burning (CH4, N2O)"             ~ "afolu_biomass_burning",
    subsector_title == "Rice cultivation (CH4)"                 ~ "afolu_rice",
    subsector_title == "Synthetic fertilizer application (N2O)" ~ "afolu_synthetic_fertilizer",
    subsector_title == "Non-residential"                        ~ "buildings_non-residential",
    subsector_title == "Residential"                            ~ "buildings_residential",
    subsector_title == "Non-CO2 (all buildings)"                ~ "buildings_non-co2",
    subsector_title == "Electricity & heat"                     ~ "energy_electricity_and_heat",
    subsector_title == "Other (energy systems)"                 ~ "energy_other",
    subsector_title == "Coal mining fugitive emissions"         ~ "energy_coal_mining_fugitive",
    subsector_title == "Oil and gas fugitive emissions"         ~ "energy_oil_and_gas_fugitive",
    subsector_title == "Petroleum refining"                     ~ "energy_petroleum_refining",
    subsector_title == "Chemicals"                              ~ "industry_chemicals",
    subsector_title == "Cement"                                 ~ "industry_cement",
    subsector_title == "Metals"                                 ~ "industry_metals",
    subsector_title == "Other (industry)"                       ~ "industry_other",
    subsector_title == "Waste"                                  ~ "industry_waste",
    subsector_title == "Domestic Aviation"                      ~ "transport_domestic_aviation",
    subsector_title == "Inland Shipping"                        ~ "transport_inland_shipping",
    subsector_title == "Other (transport)"                      ~ "transport_other",
    subsector_title == "Road"                                   ~ "transport_road",
    subsector_title == "Rail"                                   ~ "transport_rail",
    subsector_title == "International Aviation"                 ~ "transport_international_aviation",
    subsector_title == "International Shipping"                 ~ "transport_international_shipping",
    TRUE ~ NA_character_
  )) %>%
  filter(!is.na(subsector_short))

# Create full panel: every country × every subsector (fill missing = 0)
all_subsectors <- ghg %>% distinct(sector_title, subsector_title, subsector_short)
all_isos_ghg   <- ghg %>% distinct(iso3c, country)

ghg <- all_isos_ghg %>%
  crossing(all_subsectors) %>%
  left_join(ghg %>% select(iso3c, subsector_short, ghg),
            by = c("iso3c", "subsector_short")) %>%
  mutate(ghg = replace_na(ghg, 0)) %>%
  group_by(iso3c) %>%
  mutate(total = sum(ghg, na.rm = TRUE),
         share_subsector = if_else(total > 0, ghg / total, 0)) %>%
  ungroup()

# Build shares matrix
ghg_matrix <- ghg %>%
  select(iso3c, subsector_short, share_subsector) %>%
  pivot_wider(names_from = subsector_short,
              values_from = share_subsector,
              values_fill = 0) %>%
  column_to_rownames("iso3c") %>%
  as.matrix()

iso_ghg <- rownames(ghg_matrix)

# ── 1C: Electricity mix ──────────────────────────────────────────────────────

# ember_raw <- read_csv("data/ember_electricity_2023.csv", show_col_types = FALSE)
ember_raw <- read_csv("data/ember_electricity_2025.csv", show_col_types = FALSE)

# Use 2024 (best coverage year in Ember data)
# formerly 2022
ember_year <- 2024

cat("Ember electricity data: using year", ember_year, "\n")

ember <- ember_raw %>%
  select(country = Area, iso3c = `ISO 3 code`, year = Year,
         category = Category, sub_category = Subcategory,
         unit = Unit, variable = Variable, value = Value) %>%
  filter(year == ember_year,
         !is.na(iso3c),
         category == "Electricity generation",
         sub_category == "Fuel",
         unit == "%") %>%
  select(iso3c, source = variable, share = value) %>%
  mutate(source = tolower(source),
         source = str_replace(source, "other fossil", "fossil_other"),
         source = str_replace(source, "other renewables", "renewables_other")) %>%
  pivot_wider(names_from = "source",
              values_from = "share",
              values_fill = 0) %>%
  arrange(iso3c) %>%
  column_to_rownames("iso3c") %>%
  as.matrix()

iso_ember <- rownames(ember)

# ── 1D: Emissions trajectory ─────────────────────────────────────────────────

trajectory <- ndc_raw %>%
  select(iso3c, country, year, ghg_observed,
         ndc2_absolute_uncond, ndc2_absolute_cond)

iso_trajectory <- trajectory %>%
  filter(!is.na(ghg_observed)) %>%
  distinct(iso3c) %>%
  pull(iso3c)

# ── Define the playable country list (intersection of all three sources) ─────

iso_play <- Reduce(intersect, list(iso_ghg, iso_ember, iso_trajectory))
# Also require centroids and metadata
iso_play <- intersect(iso_play, country_meta$iso3c)
iso_play <- sort(iso_play)

cat("Playable countries:", length(iso_play), "\n")

# Filter everything to playable countries
country_meta <- country_meta %>% filter(iso3c %in% iso_play)
ghg          <- ghg          %>% filter(iso3c %in% iso_play)
ghg_matrix   <- ghg_matrix[iso_play, , drop = FALSE]
ember        <- ember[iso_play, , drop = FALSE]
trajectory   <- trajectory   %>% filter(iso3c %in% iso_play)

cat("Pipeline step 1 complete.\n")
