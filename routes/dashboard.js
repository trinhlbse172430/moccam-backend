// File: routes/dashboard.js (hoặc file router phù hợp)

const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Dashboard
 *   description: API thống kê dữ liệu hệ thống (User, Voucher, Revenue, Lessons)
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     MonthlyStat:
 *       type: object
 *       properties:
 *         month:
 *           type: integer
 *           example: 5
 *         monthName:
 *           type: string
 *           example: "Tháng 5"
 *         count:
 *           type: integer
 *           example: 120
 *     RevenueStat:
 *       type: object
 *       properties:
 *         month:
 *           type: integer
 *           example: 8
 *         monthName:
 *           type: string
 *           example: "Tháng 8"
 *         totalRevenue:
 *           type: number
 *           format: float
 *           example: 15000000
 */
/**
 * @swagger
 * /api/dashboard/user-stats-by-month:
 *   get:
 *     summary: Thống kê số lượng người dùng đăng ký theo tháng
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: year
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 2025
 *         description: Năm cần thống kê (mặc định là năm hiện tại)
 *     responses:
 *       200:
 *         description: Danh sách số người dùng đăng ký theo tháng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MonthlyStat'
 *       401:
 *         description: Thiếu hoặc sai token
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/user-stats-by-month", verifyToken, authorizeRoles("admin"), async (req, res) => {
    try {
        // Lấy năm từ query parameter, mặc định là năm hiện tại
        const year = req.query.year || new Date().getFullYear();

        const pool = await poolPromise;
        const result = await pool.request()
            .input('target_year', sql.Int, year)
            .query(`
                -- Tạo một bảng tạm chứa 12 tháng
                WITH Months AS (
                    SELECT 1 AS MonthNumber
                    UNION ALL SELECT 2
                    UNION ALL SELECT 3
                    UNION ALL SELECT 4
                    UNION ALL SELECT 5
                    UNION ALL SELECT 6
                    UNION ALL SELECT 7
                    UNION ALL SELECT 8
                    UNION ALL SELECT 9
                    UNION ALL SELECT 10
                    UNION ALL SELECT 11
                    UNION ALL SELECT 12
                ),
                -- Đếm số user theo tháng trong năm chỉ định
                UserCounts AS (
                    SELECT 
                        MONTH(created_at) AS RegistrationMonth, 
                        COUNT(user_id) AS UserCount
                    FROM Users
                    WHERE YEAR(created_at) = @target_year
                    GROUP BY MONTH(created_at)
                )
                -- Kết hợp 12 tháng với số lượng user đếm được
                SELECT 
                    m.MonthNumber AS month,
                    'Tháng ' + CAST(m.MonthNumber AS VARCHAR) AS monthName, -- Tạo tên tháng
                    ISNULL(uc.UserCount, 0) AS count -- Nếu tháng nào không có user thì trả về 0
                FROM Months m
                LEFT JOIN UserCounts uc ON m.MonthNumber = uc.RegistrationMonth
                ORDER BY m.MonthNumber;
            `);

        res.json(result.recordset);

    } catch (err) {
        console.error("❌ Error in GET /dashboard/user-stats-by-month:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});


/**
 * @swagger
 * /api/dashboard/voucher-stats-by-month:
 *   get:
 *     summary: Thống kê số lượng voucher được tạo theo tháng
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: year
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 2025
 *     responses:
 *       200:
 *         description: Danh sách số lượng voucher theo tháng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MonthlyStat'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */

router.get("/voucher-stats-by-month", verifyToken, authorizeRoles("admin"), async (req, res) => {
    try {
        const year = req.query.year || new Date().getFullYear();

        const pool = await poolPromise;
        const result = await pool.request()
            .input('target_year', sql.Int, year)
            .query(`
                WITH Months AS (
                    SELECT 1 AS MonthNumber UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
                    SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL
                    SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
                ),
                VoucherCounts AS (
                    SELECT
                        MONTH(created_at) AS CreationMonth,
                        COUNT(voucher_id) AS VoucherCount
                    FROM Vouchers
                    WHERE YEAR(created_at) = @target_year
                    GROUP BY MONTH(created_at)
                )
                SELECT
                    m.MonthNumber AS month,
                    'Tháng ' + CAST(m.MonthNumber AS VARCHAR) AS monthName,
                    ISNULL(vc.VoucherCount, 0) AS count
                FROM Months m
                LEFT JOIN VoucherCounts vc ON m.MonthNumber = vc.CreationMonth
                ORDER BY m.MonthNumber;
            `);

        res.json(result.recordset);

    } catch (err) {
        console.error("❌ Error in GET /dashboard/voucher-stats-by-month:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

/**
 * @swagger
 * /api/dashboard/revenue-stats-by-month:
 *   get:
 *     summary: Thống kê doanh thu theo tháng (chỉ admin/employee)
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: year
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 2025
 *     responses:
 *       200:
 *         description: Danh sách doanh thu theo tháng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RevenueStat'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */

router.get("/revenue-stats-by-month", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => { // Chỉ Admin/Employee mới xem được doanh thu
    try {
        const year = req.query.year || new Date().getFullYear();

        const pool = await poolPromise;
        const result = await pool.request()
            .input('target_year', sql.Int, year)
            .query(`
                WITH Months AS (
                    SELECT 1 AS MonthNumber UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
                    SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL
                    SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
                ),
                MonthlyRevenue AS (
                    SELECT
                        MONTH(created_at) AS PaymentMonth,
                        SUM(final_amount) AS MonthlySum -- Tính tổng final_amount
                    FROM Payments
                    WHERE YEAR(created_at) = @target_year
                      AND status = 'success' -- Chỉ tính các giao dịch thành công
                    GROUP BY MONTH(created_at)
                )
                SELECT
                    m.MonthNumber AS month,
                    'Tháng ' + CAST(m.MonthNumber AS VARCHAR) AS monthName,
                    ISNULL(mr.MonthlySum, 0) AS totalRevenue -- Trả về 0 nếu không có doanh thu
                FROM Months m
                LEFT JOIN MonthlyRevenue mr ON m.MonthNumber = mr.PaymentMonth
                ORDER BY m.MonthNumber;
            `);

        res.json(result.recordset);

    } catch (err) {
        console.error("❌ Error in GET /dashboard/revenue-stats-by-month:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});


/**
 * @swagger
 * /api/dashboard/lesson-stats-by-month:
 *   get:
 *     summary: Thống kê số lượng bài học được tạo theo tháng
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: year
 *         in: query
 *         required: false
 *         schema:
 *           type: integer
 *           example: 2025
 *     responses:
 *       200:
 *         description: Danh sách số lượng bài học theo tháng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MonthlyStat'
 *       401:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/lesson-stats-by-month", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => { // Assuming only admin/employee needs this
    try {
        const year = req.query.year || new Date().getFullYear();

        const pool = await poolPromise;
        const result = await pool.request()
            .input('target_year', sql.Int, year)
            .query(`
                WITH Months AS (
                    SELECT 1 AS MonthNumber UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL
                    SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9 UNION ALL
                    SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12
                ),
                LessonCounts AS (
                    SELECT
                        MONTH(created_at) AS CreationMonth,
                        COUNT(lesson_id) AS LessonCount -- Count lessons
                    FROM Lessons -- Query the Lessons table
                    WHERE YEAR(created_at) = @target_year
                    GROUP BY MONTH(created_at)
                )
                SELECT
                    m.MonthNumber AS month,
                    'Tháng ' + CAST(m.MonthNumber AS VARCHAR) AS monthName,
                    ISNULL(lc.LessonCount, 0) AS count -- Use LessonCount here
                FROM Months m
                LEFT JOIN LessonCounts lc ON m.MonthNumber = lc.CreationMonth -- Join with LessonCounts
                ORDER BY m.MonthNumber;
            `);

        res.json(result.recordset);

    } catch (err) {
        console.error("❌ Error in GET /dashboard/lesson-stats-by-month:", err.message);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;