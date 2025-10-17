const express = require("express");
const router = express.Router();
const bcrypt = require("bcryptjs");
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: 👤 API quản lý người dùng trong hệ thống
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         user_id:
 *           type: integer
 *           example: 1
 *         email:
 *           type: string
 *           example: "user@example.com"
 *         full_name:
 *           type: string
 *           example: "Nguyen Van A"
 *         phone_number:
 *           type: string
 *           example: "0912345678"
 *         role:
 *           type: string
 *           example: "customer"
 *         date_of_birth:
 *           type: string
 *           format: date
 *           example: "2000-05-20"
 *         picture:
 *           type: string
 *           example: "https://example.com/avatar.jpg"
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-10-05T08:00:00Z"
 */

/* ===========================================================
   🔹 GET /api/users/ping
   → Kiểm tra API hoạt động
=========================================================== */
/**
 * @swagger
 * /api/users/ping:
 *   get:
 *     summary: 🔄 Kiểm tra API hoạt động
 *     tags: [Users]
 *     responses:
 *       200:
 *         description: Users API is working
 */
router.get("/ping", (req, res) => res.send("Users API is working!"));

/* ===========================================================
   👥 GET /api/users
   → Lấy toàn bộ người dùng (Admin)
=========================================================== */
/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: 👥 Lấy danh sách tất cả người dùng (chỉ Admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Danh sách người dùng
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       403:
 *         description: Không có quyền truy cập
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/", verifyToken, authorizeRoles("admin"), async (req, res) => {
  try {
    const pool = await poolPromise;

    // Lấy ID của admin đang đăng nhập từ token
    const currentAdminId = req.user.id;

    const result = await pool.request()
      // 🛡️ Thêm ID của admin vào query một cách an toàn
      .input('current_admin_id', sql.Int, currentAdminId)
      .query(`
        SELECT user_id, email, full_name, date_of_birth, picture, phone_number, role, created_at 
        FROM Users
        WHERE user_id <> @current_admin_id 
      `);

    res.json(result.recordset);
  } catch (err) {
    console.error("❌ Error in GET /users:", err.message);
    res.status(500).send("Server error");
  }
});

/* ===========================================================
   🔍 GET /api/users/{id}
   → Lấy thông tin người dùng cụ thể
=========================================================== */
/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: 🔍 Lấy thông tin người dùng theo ID
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Thông tin người dùng
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: Không có quyền xem người khác
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi máy chủ
 */
router.get("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  try {
    const pool = await poolPromise;

    // ❗ Nếu không phải admin, chỉ được xem chính mình
    if (req.user.role !== "admin" && req.user.id !== parseInt(req.params.id, 10)) {
      return res.status(403).json({ message: "You are not allowed to view other people's information" });
    }

    const result = await pool.request()
      .input("user_id", sql.Int, req.params.id)
      .query(`
        SELECT user_id, full_name, email, phone_number, role, date_of_birth, picture 
        FROM Users 
        WHERE user_id = @user_id
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json(result.recordset[0]);
  } catch (err) {
    console.error("❌ Error in GET /users/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/* ===========================================================
   ➕ POST /api/users/create
   → Tạo người dùng mới (Admin / Employee)
=========================================================== */
/**
 * @swagger
 * /api/users/create:
 *   post:
 *     summary: ➕ Thêm người dùng mới (Admin hoặc Employee)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - full_name
 *               - phone_number
 *               - role
 *             properties:
 *               email:
 *                 type: string
 *                 example: "newuser@example.com"
 *               password:
 *                 type: string
 *                 example: "123456"
 *               full_name:
 *                 type: string
 *                 example: "Tran Thi B"
 *               phone_number:
 *                 type: string
 *                 example: "0987654321"
 *               role:
 *                 type: string
 *                 example: "customer"
 *               date_of_birth:
 *                 type: string
 *                 example: "2002-08-10"
 *               picture:
 *                 type: string
 *                 example: "https://example.com/avatar.png"
 *     responses:
 *       201:
 *         description: ✅ User added successfully
 *       400:
 *         description: Email hoặc số điện thoại bị trùng
 *       500:
 *         description: Lỗi máy chủ
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
  const { password, email, full_name, phone_number, role, date_of_birth, picture } = req.body;

  if (!password || !email || !full_name || !phone_number || !role) {
    return res.status(400).json({
      message: "Missing required fields: password, email, full_name, phone_number, role"
    });
  }

  try {
    const pool = await poolPromise;

    // Kiểm tra email/phone trùng
    const checkEmail = await pool.request()
      .input("email", sql.VarChar(50), email)
      .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email");

    if (checkEmail.recordset[0].count > 0)
      return res.status(400).json({ message: "Email already exists" });

    const checkPhone = await pool.request()
      .input("phone_number", sql.VarChar(10), phone_number)
      .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number");

    if (checkPhone.recordset[0].count > 0)
      return res.status(400).json({ message: "Phone number already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.request()
      .input("email", sql.VarChar(50), email)
      .input("password", sql.VarChar(200), hashedPassword)
      .input("full_name", sql.NVarChar(50), full_name)
      .input("phone_number", sql.VarChar(10), phone_number)
      .input("role", sql.VarChar(10), role)
      .input("date_of_birth", sql.Date, date_of_birth || null)
      .input("picture", sql.NVarChar(sql.MAX), picture || null)
      .query(`
        INSERT INTO Users (email, password, full_name, phone_number, role, date_of_birth, picture, created_at)
        VALUES (@email, @password, @full_name, @phone_number, @role, @date_of_birth, @picture, GETDATE())
      `);

    res.status(201).json({ message: "✅ User added successfully" });
  } catch (err) {
    console.error("❌ Error in POST /users:", err.message);
    res.status(500).send("Server error");
  }
});

/* ===========================================================
   ✏️ PUT /api/users/{id}
   → Cập nhật thông tin người dùng
=========================================================== */
/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: ✏️ Cập nhật thông tin người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name:
 *                 type: string
 *               email:
 *                 type: string
 *               phone_number:
 *                 type: string
 *               role:
 *                 type: string
 *               password:
 *                 type: string
 *               picture:
 *                 type: string
 *     responses:
 *       200:
 *         description: ✅ Cập nhật thành công
 *       400:
 *         description: Dữ liệu không hợp lệ
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi máy chủ
 */
router.put("/:id", verifyToken, authorizeRoles("admin", "employee", "customer"), async (req, res) => {
  const { full_name, email, phone_number, role, password, date_of_birth, picture } = req.body;

  if (Object.keys(req.body).length === 0)
    return res.status(400).json({ message: "No fields to update provided" });

  if (req.user.role !== "admin" && req.user.id !== parseInt(req.params.id, 10))
    return res.status(403).json({ message: "You are not allowed to modify other people's information" });

  try {
    const pool = await poolPromise;
    const existing = await pool.request()
      .input("user_id", sql.Int, req.params.id)
      .query("SELECT * FROM Users WHERE user_id = @user_id");

    if (existing.recordset.length === 0)
      return res.status(404).json({ message: "User not found" });

    const user = existing.recordset[0];
    const setClauses = [];
    const request = pool.request().input("user_id", sql.Int, req.params.id);

    // ✅ Kiểm tra & cập nhật từng trường
    if (full_name && full_name !== user.full_name) { setClauses.push("full_name = @full_name"); request.input("full_name", sql.NVarChar(50), full_name); }
    if (email && email !== user.email) {
      const checkEmail = await pool.request().input("email", sql.VarChar(50), email).input("user_id", sql.Int, req.params.id)
        .query("SELECT COUNT(*) AS count FROM Users WHERE email = @email AND user_id != @user_id");
      if (checkEmail.recordset[0].count > 0) return res.status(400).json({ message: "Email already exists" });
      setClauses.push("email = @email"); request.input("email", sql.VarChar(50), email);
    }
    if (phone_number && phone_number !== user.phone_number) {
      const checkPhone = await pool.request().input("phone_number", sql.VarChar(10), phone_number).input("user_id", sql.Int, req.params.id)
        .query("SELECT COUNT(*) AS count FROM Users WHERE phone_number = @phone_number AND user_id != @user_id");
      if (checkPhone.recordset[0].count > 0) return res.status(400).json({ message: "Phone number already exists" });
      setClauses.push("phone_number = @phone_number"); request.input("phone_number", sql.VarChar(10), phone_number);
    }
    if (role && role !== user.role) { setClauses.push("role = @role"); request.input("role", sql.VarChar(10), role); }
    if (date_of_birth && date_of_birth !== user.date_of_birth) { setClauses.push("date_of_birth = @date_of_birth"); request.input("date_of_birth", sql.Date, date_of_birth); }
    if (picture && picture !== user.picture) { setClauses.push("picture = @picture"); request.input("picture", sql.NVarChar(sql.MAX), picture); }

    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      setClauses.push("password = @password");
      request.input("password", sql.VarChar(200), hashed);
    }

    if (setClauses.length === 0) return res.status(400).json({ message: "No new information to update" });

    await request.query(`UPDATE Users SET ${setClauses.join(", ")} WHERE user_id = @user_id`);
    res.json({ message: "✅ User updated successfully" });
  } catch (err) {
    console.error("❌ Error in PUT /users/:id:", err.message);
    res.status(500).send("Server error");
  }
});

/* ===========================================================
   🗑️ DELETE /api/users/{id}
   → Xóa người dùng (Admin)
=========================================================== */
/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: 🗑️ Xóa người dùng (chỉ Admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: ✅ User deleted successfully
 *       404:
 *         description: Không tìm thấy người dùng
 *       500:
 *         description: Lỗi máy chủ
 */
// File: routes/users.js

router.delete("/:id", verifyToken, authorizeRoles("admin"), async (req, res) => {
    try {
        const userIdToDelete = req.params.id;
        const pool = await poolPromise;

        // An toàn: Không cho phép admin tự xóa tài khoản của chính mình
        if (req.user.id == userIdToDelete) {
            return res.status(403).json({
                message: "Forbidden: Administrators cannot delete their own account."
            });
        }

        // --- Bắt đầu chuỗi kiểm tra các bảng liên quan ---

        // 1. Kiểm tra bảng UserSubscriptions
        const subscriptionCheck = await pool.request()
            .input("user_id", sql.Int, userIdToDelete)
            .query("SELECT COUNT(*) AS count FROM UserSubscriptions WHERE user_id = @user_id");
        if (subscriptionCheck.recordset[0].count > 0) {
            return res.status(400).json({
                message: "Cannot delete this user.",
                reason: "User has one or more active or past subscriptions."
            });
        }

        // 2. Kiểm tra bảng Payments
        const paymentCheck = await pool.request()
            .input("user_id", sql.Int, userIdToDelete)
            .query("SELECT COUNT(*) AS count FROM Payments WHERE user_id = @user_id");
        if (paymentCheck.recordset[0].count > 0) {
            return res.status(400).json({
                message: "Cannot delete this user.",
                reason: "User has a payment history."
            });
        }

        // 3. 🎟️ Kiểm tra bảng Vouchers (kiểm tra xem user này đã tạo voucher nào chưa)
        const voucherCheck = await pool.request()
            .input("created_by", sql.Int, userIdToDelete)
            .query("SELECT COUNT(*) AS count FROM Vouchers WHERE created_by = @created_by");
        if (voucherCheck.recordset[0].count > 0) {
            return res.status(400).json({
                message: "Cannot delete this user.",
                reason: "User has created one or more vouchers. Please reassign or delete them first."
            });
        }

        // 4. 🔔 Kiểm tra bảng Notifications
        const notificationCheck = await pool.request()
            .input("user_id", sql.Int, userIdToDelete)
            .query("SELECT COUNT(*) AS count FROM Notifications WHERE user_id = @user_id");
        if (notificationCheck.recordset[0].count > 0) {
            return res.status(400).json({
                message: "Cannot delete this user.",
                reason: "User has one or more personal notifications."
            });
        }

        // --- Nếu tất cả kiểm tra đều qua, mới tiến hành xóa ---
        const result = await pool.request()
            .input("user_id", sql.Int, userIdToDelete)
            .query("DELETE FROM Users WHERE user_id = @user_id");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        res.json({ message: "✅ User deleted successfully" });

    } catch (err) {
        console.error("❌ Error in DELETE /users/:id:", err.message);
        res.status(500).send("Server error");
    }
});

module.exports = router;
