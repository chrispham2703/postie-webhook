// Express only recognizes this as error-handling middleware because it
// declares exactly 4 parameters -- `_next` must stay even though it's unused.
const errorHandler = (err, req, res, _next) => {
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