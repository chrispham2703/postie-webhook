const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
dotenv.config();

const healthRouter = require('./routes/health');
const eventRouter = require('./routes/events');
const notFoundHandler = require('./middleware/notFoundHandler');
const errorHandler = require('./middleware/errorHandler');
const { connect } = require('./config/rabbitmq');

const app = express();

app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use('/health', healthRouter);
app.use('/api/events', eventRouter);
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = process.env.PORT || 3000;

async function start() {
    await connect();
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
    });
}

start();
