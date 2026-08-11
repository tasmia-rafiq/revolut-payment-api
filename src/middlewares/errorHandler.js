export const errorHandler = (
  error,
  req,
  res,
  next
) => {
  console.error(
    `[${req.method}] ${req.originalUrl}`,
    error
  );

  // ------------------------------------
  // If headers have already been sent,
  // delegate to Express.
  // ------------------------------------

  if (res.headersSent) {
    return next(error);
  }

  // ------------------------------------
  // Mongoose validation error
  // ------------------------------------

  if (
    error.name === "ValidationError"
  ) {
    return res.status(400).json({
      success: false,
      error: "Validation error",
      details: Object.values(
        error.errors
      ).map((item) => item.message),
    });
  }

  // ------------------------------------
  // Invalid ObjectId / CastError
  // ------------------------------------

  if (error.name === "CastError") {
    return res.status(400).json({
      success: false,
      error: "Invalid resource identifier",
    });
  }

  // ------------------------------------
  // MongoDB duplicate key
  // ------------------------------------

  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      error: "Duplicate resource",
    });
  }

  // ------------------------------------
  // Revolut API errors
  // ------------------------------------

  if (error.isRevolutError) {
    return res.status(
      error.statusCode || 502
    ).json({
      success: false,
      error:
        error.message ||
        "Revolut API request failed",
      code: error.code,
    });
  }

  // ------------------------------------
  // Default
  // ------------------------------------

  return res.status(500).json({
    success: false,
    error: "Internal server error",
  });
};