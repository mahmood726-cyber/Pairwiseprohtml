# metafor reference values for the proportion meta-analysis engine.
# Run:  Rscript.exe validate.R
suppressMessages(library(metafor))
options(digits = 10)

xi <- c(0, 3, 12, 5, 20, 8, 15, 2)
ni <- c(20, 25, 60, 40, 100, 50, 80, 18)

cat("=== Logit (PLO) ===\n")
dl <- escalc(measure = "PLO", xi = xi, ni = ni, add = 0, to = "none")
cat("yi:", paste(round(dl$yi, 8), collapse = ", "), "\n")
cat("vi:", paste(round(dl$vi, 8), collapse = ", "), "\n")
# with metafor default add=1/2 to=only0 for zero-cell study (study 1: xi=0)
dl2 <- escalc(measure = "PLO", xi = xi, ni = ni)
cat("yi(add0.5 only0):", paste(round(dl2$yi, 8), collapse = ", "), "\n")
cat("vi(add0.5 only0):", paste(round(dl2$vi, 8), collapse = ", "), "\n")

mlo <- rma(yi, vi, data = dl2, method = "DL")
plo <- predict(mlo, transf = transf.ilogit)
cat("PLO mu(logit):", round(coef(mlo), 8), "\n")
cat("PLO tau2:", round(mlo$tau2, 8), " I2:", round(mlo$I2, 6), " QE:", round(mlo$QE, 6), "\n")
cat("PLO pooled prop:", round(plo$pred, 8), " ci.lb:", round(plo$ci.lb, 8), " ci.ub:", round(plo$ci.ub, 8), "\n")

cat("\n=== Freeman-Tukey (PFT) ===\n")
ft <- escalc(measure = "PFT", xi = xi, ni = ni)
cat("yi:", paste(round(ft$yi, 8), collapse = ", "), "\n")
cat("vi:", paste(round(ft$vi, 8), collapse = ", "), "\n")
mft <- rma(yi, vi, data = ft, method = "DL")
pft <- predict(mft, transf = transf.ipft.hm, targ = list(ni = ni))
cat("PFT mu(ft):", round(coef(mft), 8), "\n")
cat("PFT tau2:", round(mft$tau2, 8), " I2:", round(mft$I2, 6), " QE:", round(mft$QE, 6), "\n")
cat("PFT pooled prop:", round(pft$pred, 8), " ci.lb:", round(pft$ci.lb, 8), " ci.ub:", round(pft$ci.ub, 8), "\n")
