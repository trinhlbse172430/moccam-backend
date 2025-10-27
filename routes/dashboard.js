const express = require("express");
const router = express.Router();
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// GET /api/dashboard/user-stats-by-month (Thống kê User mới theo tháng)
router.get("/user-stats-by-month", verifyToken, authorizeRoles("admin"), async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();

        // Câu lệnh SQL cho MySQL để lấy số user mới theo tháng
        const sqlQuery = `
            -- Tạo bảng ảo 12 tháng
            WITH RECURSIVE Months AS (
                SELECT 1 AS MonthNumber
                UNION ALL
                SELECT MonthNumber + 1 FROM Months WHERE MonthNumber < 12
            ),
            -- Đếm user theo tháng
            UserCounts AS (
                SELECT 
                    MONTH(created_at) AS RegistrationMonth, 
                    COUNT(user_id) AS UserCount
                FROM Users
                WHERE YEAR(created_at) = ? 
                GROUP BY MONTH(created_at)
            )
            -- Kết hợp và trả về kết quả
            SELECT 
                m.MonthNumber AS month,
                CONCAT('Tháng ', m.MonthNumber) AS monthName, -- Hàm CONCAT thay cho +
                COALESCE(uc.UserCount, 0) AS count -- Hàm COALESCE thay cho ISNULL
            FROM Months m
            LEFT JOIN UserCounts uc ON m.MonthNumber = uc.RegistrationMonth
            ORDER BY m.MonthNumber;
        `;

        const [rows] = await pool.query(sqlQuery, [year]);
        res.json(rows);

    } catch (err) {
        console.error("❌ Lỗi GET /dashboard/user-stats-by-month:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/dashboard/voucher-stats-by-month (Thống kê Voucher mới theo tháng)
router.get("/voucher-stats-by-month", verifyToken, authorizeRoles("admin"), async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();

        const sqlQuery = `
            WITH RECURSIVE Months AS (
                SELECT 1 AS MonthNumber UNION ALL SELECT MonthNumber + 1 FROM Months WHERE MonthNumber < 12
            ),
            VoucherCounts AS (
                SELECT
                    MONTH(created_at) AS CreationMonth,
                    COUNT(voucher_id) AS VoucherCount
                FROM Vouchers
                WHERE YEAR(created_at) = ?
                GROUP BY MONTH(created_at)
            )
            SELECT
                m.MonthNumber AS month,
                CONCAT('Tháng ', m.MonthNumber) AS monthName,
                COALESCE(vc.VoucherCount, 0) AS count
            FROM Months m
            LEFT JOIN VoucherCounts vc ON m.MonthNumber = vc.CreationMonth
            ORDER BY m.MonthNumber;
        `;

        const [rows] = await pool.query(sqlQuery, [year]);
        res.json(rows);

    } catch (err) {
        console.error("❌ Lỗi GET /dashboard/voucher-stats-by-month:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/dashboard/revenue-stats-by-month (Thống kê Doanh thu theo tháng)
router.get("/revenue-stats-by-month", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();

        const sqlQuery = `
            WITH RECURSIVE Months AS (
                SELECT 1 AS MonthNumber UNION ALL SELECT MonthNumber + 1 FROM Months WHERE MonthNumber < 12
            ),
            MonthlyRevenue AS (
                SELECT
                    MONTH(created_at) AS PaymentMonth,
                    SUM(final_amount) AS MonthlySum
                FROM Payments
                WHERE YEAR(created_at) = ?
                  AND status = 'success'
                GROUP BY MONTH(created_at)
            )
            SELECT
                m.MonthNumber AS month,
                CONCAT('Tháng ', m.MonthNumber) AS monthName,
                COALESCE(mr.MonthlySum, 0) AS totalRevenue
            FROM Months m
            LEFT JOIN MonthlyRevenue mr ON m.MonthNumber = mr.PaymentMonth
            ORDER BY m.MonthNumber;
        `;

        const [rows] = await pool.query(sqlQuery, [year]);
        res.json(rows);

    } catch (err) {
        console.error("❌ Lỗi GET /dashboard/revenue-stats-by-month:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

// GET /api/dashboard/lesson-stats-by-month (Thống kê Bài học mới theo tháng)
router.get("/lesson-stats-by-month", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();

        const sqlQuery = `
            WITH RECURSIVE Months AS (
                SELECT 1 AS MonthNumber UNION ALL SELECT MonthNumber + 1 FROM Months WHERE MonthNumber < 12
            ),
            LessonCounts AS (
                SELECT
                    MONTH(created_at) AS CreationMonth,
                    COUNT(lesson_id) AS LessonCount
                FROM Lessons
                WHERE YEAR(created_at) = ?
                GROUP BY MONTH(created_at)
            )
            SELECT
                m.MonthNumber AS month,
                CONCAT('Tháng ', m.MonthNumber) AS monthName,
                COALESCE(lc.LessonCount, 0) AS count
            FROM Months m
            LEFT JOIN LessonCounts lc ON m.MonthNumber = lc.CreationMonth
            ORDER BY m.MonthNumber;
        `;

        const [rows] = await pool.query(sqlQuery, [year]);
        res.json(rows);

    } catch (err) {
        console.error("❌ Lỗi GET /dashboard/lesson-stats-by-month:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;