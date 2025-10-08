const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Subscriptions API is working!");
});

/**
 * 📌 GET /api/subscriptions
 * Lấy toàn bộ danh sách gói đăng ký
 */
router.get("/", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT s.*, c.full_name AS customer_name
      FROM Subscriptions s
      JOIN Customers c ON s.customer_id = c.customer_id
      ORDER BY s.start_date DESC
    `);
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /subscriptions:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/subscriptions/:id
 * Lấy thông tin gói đăng ký theo ID
 */
router.get("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("subcription_id", sql.Int, req.params.id)
      .query(`
        SELECT s.*, c.full_name AS customer_name
        FROM Subscriptions s
        JOIN Customers c ON s.customer_id = c.customer_id
        WHERE s.subcription_id = @subcription_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /subscriptions/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 GET /api/subscriptions/customer/:customer_id
 * Lấy danh sách gói đăng ký của 1 khách hàng
 */
router.get("/customer/:customer_id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("customer_id", sql.Int, req.params.customer_id)
      .query(`
        SELECT * FROM Subscriptions
        WHERE customer_id = @customer_id
        ORDER BY start_date DESC
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "No subscriptions found for this customer" });
    }

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /subscriptions/customer/:customer_id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 POST /api/subscriptions
 * Thêm gói đăng ký mới
 * Required: customer_id, subcription_name, start_date, end_date
 */
router.post("/", async (req, res) => {
  const { customer_id, subcription_name, start_date, end_date, is_active } = req.body;

  if (!customer_id || !subcription_name || !start_date || !end_date) {
    return res.status(400).json({ message: "Missing required fields: customer_id, subcription_name, start_date, end_date" });
  }

  if (new Date(start_date) >= new Date(end_date)) {
    return res.status(400).json({ message: "End date must be after start date" });
  }

  try {
    const pool = await poolPromise;

    // 🔍 Kiểm tra customer_id tồn tại
    const checkCustomer = await pool.request()
      .input("customer_id", sql.Int, customer_id)
      .query("SELECT COUNT(*) AS count FROM Customers WHERE customer_id = @customer_id");

    if (checkCustomer.recordset[0].count === 0) {
      return res.status(400).json({ message: "Invalid customer_id: customer not found" });
    }

    // ✅ Thêm mới
    await pool.request()
      .input("customer_id", sql.Int, customer_id)
      .input("subcription_name", sql.NVarChar(30), subcription_name)
      .input("start_date", sql.DateTime, start_date)
      .input("end_date", sql.DateTime, end_date)
      .input("is_active", sql.Bit, is_active ?? 1)
      .query(`
        INSERT INTO Subscriptions (customer_id, subcription_name, start_date, end_date, is_active)
        VALUES (@customer_id, @subcription_name, @start_date, @end_date, @is_active)
      `);

    res.status(201).json({ message: "✅ Subscription created successfully" });
  } catch (err) {
    console.error("❌ Error in POST /subscriptions:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/subscriptions/:id
 * Cập nhật thông tin gói đăng ký
 */
router.put("/:id", async (req, res) => {
  const { subcription_name, start_date, end_date, is_active } = req.body;

  if (!subcription_name || !start_date || !end_date) {
    return res.status(400).json({ message: "Missing required fields: subcription_name, start_date, end_date" });
  }

  if (new Date(start_date) >= new Date(end_date)) {
    return res.status(400).json({ message: "End date must be after start date" });
  }

  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("subcription_id", sql.Int, req.params.id)
      .input("subcription_name", sql.NVarChar(30), subcription_name)
      .input("start_date", sql.DateTime, start_date)
      .input("end_date", sql.DateTime, end_date)
      .input("is_active", sql.Bit, is_active ?? 1)
      .query(`
        UPDATE Subscriptions
        SET subcription_name = @subcription_name,
            start_date = @start_date,
            end_date = @end_date,
            is_active = @is_active
        WHERE subcription_id = @subcription_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.json({ message: "✅ Subscription updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /subscriptions/:id:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 PUT /api/subscriptions/check-status
 * Tự động cập nhật trạng thái hoạt động (is_active)
 */
router.put("/check-status/all", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      UPDATE Subscriptions
      SET is_active = CASE 
        WHEN GETDATE() BETWEEN start_date AND end_date THEN 1
        ELSE 0
      END
    `);

    res.json({ message: `✅ Updated ${result.rowsAffected[0]} subscriptions' statuses` });
  } catch (err) {
    console.error("❌ Error in PUT /subscriptions/check-status:", err.message);
    res.status(500).send(err.message);
  }
});

/**
 * 📌 DELETE /api/subscriptions/:id
 * Xóa gói đăng ký
 */
router.delete("/:id", async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("subcription_id", sql.Int, req.params.id)
      .query("DELETE FROM Subscriptions WHERE subcription_id = @subcription_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "Subscription not found" });
    }

    res.json({ message: "✅ Subscription deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /subscriptions/:id:", err.message);
    res.status(500).send(err.message);
  }
});

module.exports = router;
