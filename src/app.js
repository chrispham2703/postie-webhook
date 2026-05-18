const express = require("express");
const dotenv = require("dotenv");
const morgan = require("morgan");
const cors = require("cors");
const healthRouter = require("./routes/health");

dotenv.config();

const app = express();

app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use("/health", healthRouter);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

