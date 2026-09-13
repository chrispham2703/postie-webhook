const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
dotenv.config();

const healthRouter = require('./routes/health');
const eventRouter = require('./routes/events');
const endpointRouter = require('./routes/endpoints');
const applicationRouter = require('./routes/applications');
const authRouter = require('./routes/auth');
const apiKeyRouter = require('./routes/apiKeys');
const dashboardEventsRouter = require('./routes/dashboardEvents');
const notFoundHandler = require('./middleware/notFoundHandler');
const errorHandler = require('./middleware/errorHandler');
const { connect } = require('./config/rabbitmq');

const app = express();

app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use('/health', healthRouter);
app.use('/api/events', eventRouter);
app.use('/api/endpoints', endpointRouter);
app.use('/api/applications', applicationRouter);
app.use('/api/auth', authRouter);
app.use('/api/api-keys', apiKeyRouter);
app.use('/api/dashboard/events', dashboardEventsRouter);
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
