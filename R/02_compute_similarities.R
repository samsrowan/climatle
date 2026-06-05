# 02_compute_similarities.R — Compute cosine similarity matrices
# Requires: objects from 01_load_and_process.R + functions.R

source("R/functions.R")

# Sectoral GHG similarity (country × country)
S_ghg <- cosine_sim_matrix(ghg_matrix)
cat("GHG similarity matrix:", nrow(S_ghg), "×", ncol(S_ghg), "\n")

# Electricity mix similarity (country × country)
S_energy <- cosine_sim_matrix(ember)
cat("Energy similarity matrix:", nrow(S_energy), "×", ncol(S_energy), "\n")

# Emissions-trajectory similarity (country × country) — shape of the 1990–2024
# normalized index. Two countries are highly similar here if they grew (or
# declined) in roughly the same pattern over time.
#
# Plain cosine on the indexed series clusters every country between 0.8 and 1.0
# because all rows start at exactly 100 in 1990 and stay positive — the shared
# baseline dominates the inner product. Mean-centering each row first turns
# this into Pearson correlation: it captures *shape* of the deviations from
# each country's own average. We then rescale (r+1)/2 so the score lands in
# [0, 1] with the intuitive reading: 100% = identical shape, 50% = uncorrelated
# (orthogonal), 0% = opposite shape (one grew, the other declined).
trajectory_centered <- trajectory_matrix - rowMeans(trajectory_matrix, na.rm = TRUE)
S_trajectory <- (cosine_sim_matrix(trajectory_centered) + 1) / 2
cat("Trajectory similarity matrix:", nrow(S_trajectory), "×", ncol(S_trajectory), "\n")

cat("Pipeline step 2 complete.\n")
