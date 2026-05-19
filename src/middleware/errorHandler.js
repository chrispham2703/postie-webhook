const errorHandler = (err, req, res, next) => {
    const statusCode = err.status || 500;

    const isProduction = process.env.NODE_ENV === 'production';
    const message = isProduction ? "Internal Server Error" : err.message;

    console.error(err);

    const errorResponse = {
        message,
        status: statusCode
    };

    if (!isProduction) {
        errorResponse.stack = err.stack;
    }

    res.status(statusCode).json({ error: errorResponse });
};

module.exports = errorHandler;