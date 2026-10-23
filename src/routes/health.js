const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const express = require("express");
const router = express.Router();
router.get("/", async (req,res)=> {
    try {
        await prisma.$queryRaw`SELECT 1`
        res.json({ status: "ok",
            service: "postie-webhook",
            timestamp: new Date().toISOString()
        })
    }
    catch (err) {
        res.status(503).json({
            status: "error"
        })
    }
});
module.exports = router;