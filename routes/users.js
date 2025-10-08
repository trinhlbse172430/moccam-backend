const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
  res.send("Users API is working!");
});

/**
 * 📌 Lấy tất cả khách hàng
 * GET /api/Users
 */
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request().query("SELECT * FROM Users");
    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /Users:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 Lấy khách hàng theo ID
 * GET /api/Users/:id
 */
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const pool = await poolPromise;

    // ❗ Nếu không phải admin, chỉ được xem chính mình
    if (req.user.role !== "admin" && req.user.user_id != req.params.id) {
      return res.status(403).json({ message: "You are not allowed to view other people's information" });
    }

    const result = await pool.request()
      .input("user_id", sql.Int, req.params.id)
      .query("SELECT user_id, full_name, email, phone_number, role FROM Users WHERE user_id = @user_id");

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "User does not exist" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /users/:id:", err.message);
    res.status(500).send("Server error");
  }
});


/**
 * 📌 Thêm khách hàng mới
 * POST /api/Users/create
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { password, email, full_name, phone_number, role} = req.body;

  if (!password || !email || !full_name || !phone_number || !role) {
    return res.status(400).json({
      message: "Missing required fields: password, email, full_name, phone_number, role"
    });
  }

  try {
    const pool = await poolPromise;

    // 🔹 Kiểm tra email trùng
    const checkEmail = await pool.request()
      .input("email", sql.VarChar(50), email)
      .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email");

    if (checkEmail.recordset[0].count > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // 🔹 Kiểm tra số điện thoại trùng
    const checkPhone = await pool.request()
      .input("phone_number", sql.VarChar(10), phone_number)
      .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number");

    if (checkPhone.recordset[0].count > 0) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    // 🔹 Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔹 Thêm khách hàng mới
    await pool.request()
      .input("email", sql.VarChar(50), email)
      .input("password", sql.VarChar(200), hashedPassword)
      .input("full_name", sql.NVarChar(50), full_name)
      .input("phone_number", sql.VarChar(10), phone_number)
        .input("role", sql.VarChar(10), role)
      .query(`
        INSERT INTO Users (email, password, full_name, phone_number, role, created_at)
        VALUES (@email, @password, @full_name, @phone_number, @role, GETDATE())
      `);

    res.status(201).json({ message: "✅ User added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /Users:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 Cập nhật khách hàng
 * PUT /api/Users/:id
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { password, email, full_name, phone_number } = req.body;

  if (!password || !email || !full_name || !phone_number || !role) {
    return res.status(400).json({
      message: "Missing required fields: password, email, full_name, phone_number, role"
    });
  }

  try {
    const pool = await poolPromise;

    // 🔹 Kiểm tra email trùng (loại trừ chính user đang sửa)
    const checkEmail = await pool.request()
      .input("email", sql.VarChar(50), email)
      .input("User_id", sql.Int, req.params.id)
      .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email AND User_id != @User_id");

    if (checkEmail.recordset[0].count > 0) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // 🔹 Kiểm tra số điện thoại trùng
    const checkPhone = await pool.request()
      .input("phone_number", sql.VarChar(10), phone_number)
      .input("User_id", sql.Int, req.params.id)
      .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number AND User_id != @User_id");

    if (checkPhone.recordset[0].count > 0) {
      return res.status(400).json({ message: "Phone number already exists" });
    }

    // 🔹 Mã hóa mật khẩu
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🔹 Cập nhật khách hàng
    const result = await pool.request()
      .input("User_id", sql.Int, req.params.id)
      .input("email", sql.VarChar(50), email)
      .input("password", sql.VarChar(200), hashedPassword)
      .input("full_name", sql.NVarChar(50), full_name)
      .input("phone_number", sql.VarChar(10), phone_number)
      .input("role", sql.VarChar(10), role)
      .query(`
        UPDATE Users
        SET password = @password,
            email = @email,
            full_name = @full_name,
            phone_number = @phone_number
            role = @role
        WHERE User_id = @User_id
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "✅ User updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /Users/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/**
 * 📌 Xóa khách hàng
 * DELETE /api/Users/:id
 */
router.delete("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const pool = await poolPromise;
    const result = await pool.request()
      .input("User_id", sql.Int, req.params.id)
      .query("DELETE FROM Users WHERE User_id = @User_id");

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ message: "✅ User deleted successfully" });
  } catch (err) {
    console.error("❌ Error in DELETE /Users/:id:", err.message);
    res.status(500).send("Server error");
  }
});

module.exports = router;
