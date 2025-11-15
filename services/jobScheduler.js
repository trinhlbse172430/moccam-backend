// File: services/jobScheduler.js

const cron = require('node-cron');
const { pool } = require('../db'); 


const startSubscriptionUpdater = () => {
    console.log('⏰ Starting subscription update job scheduler...');
    cron.schedule('1 0 * * *', async () => {
        console.log(`[Cron Job] Running daily task: Checking for expired subscriptions...`);
        
        let connection;
        try {
            const sqlQuery = `
                UPDATE UserSubscriptions
                SET status = 'expired'
                WHERE
                    end_date < NOW()
                    AND status = 'active';
            `;
            
            connection = await pool.getConnection();
            const [result] = await connection.query(sqlQuery);
            connection.release();

            if (result.affectedRows > 0) {
                console.log(`[Cron Job] Successfully expired ${result.affectedRows} subscriptions.`);
            } else {
                console.log(`[Cron Job] No subscriptions to expire today.`);
            }

        } catch (err) {
            if (connection) connection.release();
            console.error('[Cron Job] Error checking for expired subscriptions:', err.message);
        }
    });
};

module.exports = { startSubscriptionUpdater };