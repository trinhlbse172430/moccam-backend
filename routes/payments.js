const express = require("express");
const router = express.Router();
const { PayOS } = require("@payos/node");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Kiểm tra hoạt động
router.get("/ping", (req, res) => {
  res.send("✅ Payments API is working!");
});

// ⚙️ Khởi tạo PayOS client (SDK mới)
const payos = new PayOS(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

/**
 * 📌 GET /api/payments
 * Lấy danh sách tất cả giao dịch
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT p.*, c.full_name AS user_name, s.subcription_name, v.code AS voucher_code
      FROM Payments p
      LEFT JOIN Users c ON p.user_id = c.user_id
      LEFT JOIN Subscriptions s ON p.subcription_id = s.subcription_id
      LEFT JOIN Vouchers v ON p.voucher_id = v.voucher_id
      ORDER BY p.created_at DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /payments:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/payments/:id
 * Lấy chi tiết 1 giao dịch theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("payment_id", sql.Int, req.params.id)
      .query(`
        SELECT p.*, c.full_name AS user_name, s.subcription_name, v.code AS voucher_code
        FROM Payments p
        LEFT JOIN Users c ON p.user_id = c.user_id
        LEFT JOIN Subscriptions s ON p.subcription_id = s.subcription_id
        LEFT JOIN Vouchers v ON p.voucher_id = v.voucher_id
        WHERE p.payment_id = @payment_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /payments/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/payments/payos/create
 * Tạo liên kết thanh toán PayOS
 */
router.post("/payos/create", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { subcription_id, user_id, voucher_id, original_amount, discount_amount, description } = req.body;

  if (!subcription_id || !user_id || !original_amount || !description) {
    return res.status(400).json({ message: "Missing required fields: subcription_id, user_id, original_amount, description" });
  }

  const final_amount = original_amount - (discount_amount || 0);
  if (final_amount < 0) {
    return res.status(400).json({ message: "Final amount cannot be negative" });
  }

  try {
    const pool = await poolPromise;

    // ✅ Kiểm tra user
    const checkUser = await pool.request()
      .input("user_id", sql.Int, user_id)
      .query("SELECT COUNT(*) AS count FROM Users WHERE user_id = @user_id");
    if (checkUser.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid user_id" });
    }

    // ✅ Kiểm tra voucher (nếu có)
    if (voucher_id) {
      const checkVoucher = await pool.request()
        .input("voucher_id", sql.Int, voucher_id)
        .query("SELECT COUNT(*) AS count FROM Vouchers WHERE voucher_id = @voucher_id");
      if (checkVoucher.recordset[0].count === 0) {
        return res.status(400).json({ message: "Invalid voucher_id" });
      }
    }

    // // 🔍 Kiểm tra subscription_id 
    // // const checkSub = await pool.request() 
    // // .input("subcription_id", sql.Int, subcription_id) 
    // // .query("SELECT COUNT(*) AS count FROM Subscriptions WHERE subcription_id = @subcription_id"); 
    // // if (checkSub.recordset[0].count === 0) { 
    // // return res.status(400).json({ message: "Invalid subcription_id" }); 
    // // }

    // ✅ Tạo mã đơn hàng
    const orderCode = Date.now();

    // ✅ Tạo link thanh toán qua PayOS
    const paymentLink = await payos.payment.createLink({
      orderCode,
      amount: final_amount,
      description,
      returnUrl: process.env.PAYOS_RETURN_URL,
      cancelUrl: process.env.PAYOS_CANCEL_URL,
    });

    // ✅ Lưu vào DB
    await pool.request()
      .input("subcription_id", sql.Int, subcription_id || null)
      .input("user_id", sql.Int, user_id)
      .input("voucher_id", sql.Int, voucher_id || null)
      .input("original_amount", sql.Decimal(10, 0), original_amount)
      .input("discount_amount", sql.Decimal(10, 0), discount_amount || 0)
      .input("final_amount", sql.Decimal(10, 0), final_amount)
      .input("currency", sql.VarChar(3), "VND")
      .input("payment_method", sql.VarChar(15), "PayOS")
      .input("description", sql.NVarChar(255), description)
      .input("status", sql.NVarChar(10), "pending")
      .input("transaction_id", sql.NVarChar(50), orderCode.toString())
      .query(`
        INSERT INTO Payments 
        (subcription_id, user_id, voucher_id, original_amount, discount_amount, final_amount, currency, payment_method, description, status, transaction_id, created_at)
        VALUES (@subcription_id, @user_id, @voucher_id, @original_amount, @discount_amount, @final_amount, @currency, @payment_method, @description, @status, @transaction_id, GETDATE())
      `);

    res.json({
      message: "✅ PayOS payment link created successfully",
      checkoutUrl: paymentLink.checkoutUrl,
      orderCode,
    });
  } catch (err) {
    console.error("❌ Error in /payos/create:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * 📌 GET /api/payments/payos/return
 * Người dùng được redirect về sau khi thanh toán xong
 */
router.get("/payos/return", async (req, res) => {
  try {
    const { orderCode, status, amount, message } = req.query;

    if (!orderCode || !status) {
      return res.status(400).json({ message: "Missing required parameters: orderCode, status" });
    }

    const pool = await poolPromise;
    const result = await pool.request()
      .input("transaction_id", sql.NVarChar(50), orderCode)
      .query(`
        SELECT payment_id, final_amount, status, payment_method, created_at
        FROM Payments
        WHERE transaction_id = @transaction_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    const payment = result.recordset[0];
    const normalizedStatus = (status || "").toLowerCase();

    res.json({
      message: "✅ Payment verification completed",
      data: {
        orderCode,
        amount: amount || payment.final_amount,
        status: normalizedStatus === "paid" ? "success" : normalizedStatus,
        note: message || "",
        payment_method: payment.payment_method || "PayOS",
        created_at: payment.created_at,
      },
    });
  } catch (err) {
    console.error("❌ Error in /payos/return:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

/**
 * 📌 POST /api/payments/payos/webhook
 * PayOS gọi webhook sau khi thanh toán thành công
 */
router.post("/payos/webhook", express.json({ type: "*/*" }), async (req, res) => {
  try {
    const { data, signature } = req.body;

    if (!data || !data.orderCode) {
      return res.status(400).json({ message: "Invalid webhook payload" });
    }

    // ✅ Xác thực chữ ký
    const isValid = payos.verifySignature(req.body);
    if (!isValid) {
      console.warn("⚠️ Invalid PayOS signature, ignoring webhook");
      return res.status(400).json({ message: "Invalid signature" });
    }

    const orderCode = data.orderCode;
    const status = data.status?.toUpperCase() || "FAILED";
    const paymentStatus =
      status === "PAID" ? "success" :
      status === "CANCELLED" ? "cancelled" : "failed";

    const pool = await poolPromise;
    const update = await pool.request()
      .input("transaction_id", sql.NVarChar(50), orderCode)
      .input("status", sql.NVarChar(10), paymentStatus)
      .query(`
        UPDATE Payments
        SET status = @status
        WHERE transaction_id = @transaction_id
      `);

    console.log(`✅ Payment [${orderCode}] updated to status: ${paymentStatus}`);
    res.status(200).json({ message: "Webhook processed successfully" });
  } catch (err) {
    console.error("❌ Error in /payos/webhook:", err.message);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

module.exports = router;

/**
 * 📌 PUT /api/payments/:id
 * Cập nhật thông tin giao dịch (trạng thái, phương thức, v.v.)
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { status, payment_method, transaction_id } = req.body;

  if (!status && !payment_method && !transaction_id) {
    return res.status(400).json({ message: "No fields to update" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("payment_id", sql.Int, req.params.id)
      .input("status", sql.NVarChar(10), status || null)
      .input("payment_method", sql.VarChar(15), payment_method || null)
      .input("transaction_id", sql.NVarChar(30), transaction_id || null)
      .query(`
        UPDATE Payments
        SET status = ISNULL(@status, status),
            payment_method = ISNULL(@payment_method, payment_method),
            transaction_id = ISNULL(@transaction_id, transaction_id)
        WHERE payment_id = @payment_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({ message: "✅ Payment updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /payments/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/payments/:id
 * Xóa giao dịch thanh toán
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("payment_id", sql.Int, req.params.id)
      .query("DELETE FROM Payments WHERE payment_id = @payment_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Payment not found" });
    }

    res.json({ message: "✅ Payment deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /payments/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
