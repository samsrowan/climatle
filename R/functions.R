# functions.R — Shared helper functions for Climate Tradle data pipeline

cosine_sim_matrix <- function(X,
                              normalize = FALSE,
                              na_action = c("zero", "drop_row", "error")) {
  na_action <- match.arg(na_action)
  if (is.data.frame(X)) X <- as.matrix(X)
  stopifnot(is.matrix(X), is.numeric(X))

  # NA handling
  if (na_action == "zero") {
    X[is.na(X)] <- 0
  } else if (na_action == "drop_row") {
    keep <- stats::complete.cases(X)
    X <- X[keep, , drop = FALSE]
  } else if (anyNA(X)) {
    stop("X contains NAs; set na_action = 'zero' or 'drop_row'.")
  }

  # Optional row normalization (useful for shares data)
  if (normalize) {
    rs <- rowSums(X); rs[rs == 0] <- 1
    X <- sweep(X, 1, rs, "/")
  }

  # Cosine similarity: S = (X %*% t(X)) / (||x_i|| * ||x_j||)
  row_norms <- sqrt(rowSums(X^2))
  denom <- row_norms %o% row_norms
  denom[denom == 0] <- NA_real_
  S <- tcrossprod(X) / denom
  diag(S) <- 1
  S[is.na(S)] <- 0
  dimnames(S) <- list(rownames(X), rownames(X))
  S
}
