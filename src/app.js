const express = require("express");
const dotenv = require("dotenv");
const healthRouter = require("./routes/health");
dotenv.config();
const app = express();
app.use(express.json());
app.use("/health", healthRouter);
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});