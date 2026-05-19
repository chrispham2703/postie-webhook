const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        error: {
            message: "Route not found",
            status: 404
        }
    });
};

module.exports = notFoundHandler;