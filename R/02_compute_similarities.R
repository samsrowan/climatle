# 02_compute_similarities.R — Compute cosine similarity matrices
# Requires: objects from 01_load_and_process.R + functions.R

source("R/functions.R")

# Sectoral GHG similarity (country × country)
S_ghg <- cosine_sim_matrix(ghg_matrix)
cat("GHG similarity matrix:", nrow(S_ghg), "×", ncol(S_ghg), "\n")

# Electricity mix similarity (country × country)
S_energy <- cosine_sim_matrix(ember)
cat("Energy similarity matrix:", nrow(S_energy), "×", ncol(S_energy), "\n")

cat("Pipeline step 2 complete.\n")
