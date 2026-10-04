const notFoundHandler = (req, res) => {
    res.status(404).json({
        error: {
            message: "Route not found",
            status: 404
        }
    });
};

module.exports = notFoundHandler;