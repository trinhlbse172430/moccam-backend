const express = require("express");
const router = express.Router();
const { PayOS } = require("@payos/node");
const { pool } = require("../db"); // Import pool từ db.js mới
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// Khởi tạo PayOS client
const payos = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

// POST /api/payments/payos/create (Tạo link thanh toán)
router.post("/payos/create", verifyToken, authorizeRoles("customer"), async (req, res) => {
    const user_id = req.user.id;
    const { plan_id, voucher_id } = req.body;

    if (!plan_id) {
        return res.status(400).json({ message: "Thiếu trường bắt buộc: plan_id" });
    }

    let connection; // Khai báo connection ở ngoài để dùng trong finally
    try {
        // Lấy kết nối từ pool
        connection = await pool.getConnection();

        // 1. Lấy thông tin gói
        const [planRows] = await connection.query(
            "SELECT plan_name, price FROM SubscriptionPlans WHERE plan_id = ? AND is_active = 1",
            [plan_id]
        );

        if (planRows.length === 0) {
            connection.release();
            return res.status(404).json({ message: "Gói đăng ký không tồn tại hoặc không hoạt động." });
        }

        const plan = planRows[0];
        let original_amount = plan.price;
        let discount_amount = 0;
        let currentVoucherId = voucher_id || null; // Dùng voucher_id truyền vào hoặc null

        // 2. Kiểm tra voucher (nếu có)
        if (currentVoucherId) {
            const [voucherRows] = await connection.query(
                "SELECT discount_value, used_count, max_usage FROM Vouchers WHERE voucher_id = ? AND NOW() BETWEEN start_date AND end_date", // Giả sử voucher có is_active = 1
                [currentVoucherId]
            );

            if (voucherRows.length > 0) {
                const voucher = voucherRows[0];
                if (voucher.used_count >= voucher.max_usage) {
                    connection.release();
                    return res.status(400).json({ message: "Voucher đã hết lượt sử dụng." });
                }
                discount_amount = voucher.discount_value;
            } else {
                 connection.release();
                 return res.status(400).json({ message: "Voucher không hợp lệ." });
            }
        }

        // 3. Tính toán số tiền cuối cùng
        const final_amount = Math.max(0, original_amount - discount_amount);
        const description = `Thanh toán gói ${plan.plan_name}`;
        const descriptionForPayOS = description.substring(0, 25);

        // 4. Xử lý gói miễn phí (0đ)
        if (final_amount === 0) {
            await connection.beginTransaction(); // Bắt đầu transaction cho gói 0đ
            try {
                // Ghi nhận thanh toán success
                const paymentInsertSql = `
                    INSERT INTO Payments (user_id, plan_id, voucher_id, original_amount, discount_amount, final_amount, payment_method, description, status, transaction_id, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
                `;
                const transactionIdFree = `FREE_${Date.now()}`;
                await connection.query(paymentInsertSql, [
                    user_id, plan_id, currentVoucherId, original_amount, discount_amount, 0, 'Voucher', description, 'success', transactionIdFree
                ]);

                // Cập nhật voucher nếu có
                if (currentVoucherId) {
                    await connection.query("UPDATE Vouchers SET used_count = used_count + 1 WHERE voucher_id = ?", [currentVoucherId]);
                }

                // Kích hoạt subscription
                const [subPlanRows] = await connection.query("SELECT duration_in_days FROM SubscriptionPlans WHERE plan_id = ?", [plan_id]);
                const duration = subPlanRows[0]?.duration_in_days || 30; // Mặc định 30 ngày nếu không tìm thấy
                const subInsertSql = `
                    INSERT INTO UserSubscriptions (user_id, plan_id, start_date, end_date, status)
                    VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'active')
                `;
                await connection.query(subInsertSql, [user_id, plan_id, duration]);

                await connection.commit(); // Hoàn tất transaction
                connection.release(); // Trả kết nối về pool
                return res.status(200).json({ message: "✅ Voucher đã áp dụng. Gói của bạn đã được kích hoạt miễn phí!", orderCode: null, checkoutUrl: null });

            } catch (err) {
                await connection.rollback(); // Rollback nếu có lỗi
                connection.release();
                throw err; // Ném lỗi ra ngoài để khối catch bên ngoài xử lý
            }
        }

        // 5. Xử lý gói có phí (> 0đ)
        const orderCode = Date.now().toString(); // Chuyển sang chuỗi

        // 5.1 Tạo link PayOS trước
        const paymentLink = await payos.paymentRequests.create({
            orderCode: parseInt(orderCode), // PayOS yêu cầu number
            amount: final_amount,
            description: descriptionForPayOS,
            returnUrl: process.env.PAYOS_RETURN_URL,
            cancelUrl: process.env.PAYOS_CANCEL_URL,
        });

        // 5.2 Lưu vào DB sau khi có link
        const paymentInsertSqlPaid = `
            INSERT INTO Payments (user_id, plan_id, voucher_id, original_amount, discount_amount, final_amount, payment_method, description, status, transaction_id, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `;
        await connection.query(paymentInsertSqlPaid, [
            user_id, plan_id, currentVoucherId, original_amount, discount_amount, final_amount, 'PayOS', description, 'pending', orderCode
        ]);

        connection.release(); // Trả kết nối về pool
        res.json({
            message: "✅ Tạo link thanh toán PayOS thành công",
            checkoutUrl: paymentLink.checkoutUrl,
            orderCode: orderCode, // Trả về dạng chuỗi
        });

    } catch (err) {
        if (connection) connection.release(); // Đảm bảo trả kết nối nếu có lỗi
        console.error("❌ Lỗi /payos/create:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ", error: err.message });
    }
});

// GET /api/payments/payos/return (Callback từ PayOS)
router.get("/payos/return", async (req, res) => {
    let connection;
    try {
        const { orderCode, status } = req.query;
        if (!orderCode) {
            return res.redirect(`${process.env.FRONTEND_URL}/home`);
        }

        const normalizedStatus = status?.toUpperCase();
        let paymentStatus = normalizedStatus === "PAID" ? "success" : normalizedStatus === "CANCELLED" ? "cancelled" : "failed";

        connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            // Cập nhật trạng thái Payment
            const [updateResult] = await connection.query(
                "UPDATE Payments SET status = ? WHERE transaction_id = ?",
                [paymentStatus, orderCode]
            );

             if (updateResult.affectedRows === 0) {
                 // Có thể giao dịch đã được xử lý bởi webhook (nếu dùng) hoặc orderCode sai
                 console.warn(`Payment record not found or already updated for orderCode: ${orderCode}`);
                 // Vẫn nên commit để không rollback các thay đổi khác (nếu có)
                 // Hoặc có thể rollback tùy logic của bạn
             } else {
                 console.log(`✅ Payment [${orderCode}] updated to ${paymentStatus}`);
             }


            // Kích hoạt Subscription và cập nhật Voucher nếu thành công
            if (paymentStatus === 'success') {
                const [paymentRows] = await connection.query(
                    "SELECT user_id, plan_id, voucher_id FROM Payments WHERE transaction_id = ?",
                    [orderCode]
                );

                if (paymentRows.length === 0) throw new Error(`Payment record inconsistency for orderCode: ${orderCode}`);

                const { user_id, plan_id, voucher_id } = paymentRows[0];

                // Cập nhật Voucher nếu có
                if (voucher_id) {
                    await connection.query(
                        "UPDATE Vouchers SET used_count = used_count + 1 WHERE voucher_id = ?",
                        [voucher_id]
                    );
                    console.log(`🎟️ Voucher [${voucher_id}] usage count incremented.`);
                }

                // Kích hoạt Subscription (chống trùng lặp)
                const [existingSubRows] = await connection.query(
                    "SELECT user_subscription_id FROM UserSubscriptions WHERE user_id = ? AND plan_id = ? AND start_date >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)",
                    [user_id, plan_id]
                );

                if (existingSubRows.length === 0) {
                    const [subPlanRows] = await connection.query(
                        "SELECT duration_in_days FROM SubscriptionPlans WHERE plan_id = ?",
                        [plan_id]
                    );
                    if (subPlanRows.length === 0) throw new Error(`Plan details not found: ${plan_id}`);

                    const duration = subPlanRows[0].duration_in_days;
                    const subInsertSql = `
                        INSERT INTO UserSubscriptions (user_id, plan_id, start_date, end_date, status)
                        VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY), 'active')
                    `;
                    await connection.query(subInsertSql, [user_id, plan_id, duration]);
                    console.log(`✅ Activated subscription plan ${plan_id} for user ${user_id}`);
                } else {
                     console.log(`ℹ️ Subscription for user ${user_id}, plan ${plan_id} already activated recently.`);
                }
            }

            await connection.commit(); // Hoàn tất transaction
        } catch (err) {
            await connection.rollback(); // Rollback nếu có lỗi bên trong transaction
            throw err; // Ném lỗi ra ngoài
        } finally {
             if(connection) connection.release(); // Luôn trả kết nối sau transaction
        }

        return res.redirect(`${process.env.FRONTEND_URL}/home`);
    } catch (err) {
        if (connection) connection.release(); // Đảm bảo trả kết nối nếu có lỗi ngoài transaction
        console.error("❌ Lỗi /payos/return:", err.message);
        return res.redirect(`${process.env.FRONTEND_URL}/home`);
    }
});

// GET /api/payments (Lấy lịch sử thanh toán)
router.get("/", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
    try {
        let sqlQuery = `
            SELECT p.*, u.full_name AS user_name, sp.plan_name
            FROM Payments p
            JOIN Users u ON p.user_id = u.user_id
            LEFT JOIN SubscriptionPlans sp ON p.plan_id = sp.plan_id
        `;
        const params = [];

        if (req.user.role === "customer") {
            sqlQuery += " WHERE p.user_id = ?";
            params.push(req.user.id);
        }

        sqlQuery += " ORDER BY p.created_at DESC";
        const [rows] = await pool.query(sqlQuery, params);
        res.json(rows);
    } catch (err) {
        console.error("❌ Lỗi GET /payments:", err.message);
        res.status(500).json({ message: "Lỗi máy chủ" });
    }
});

module.exports = router;