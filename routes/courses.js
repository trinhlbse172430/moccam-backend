const express = require("express");
const router = express.Router();
const { sql, poolPromise } = require("../db");
const { verifyToken, authorizeRoles } = require("../security/verifyToken");

// ✅ Test route
router.get("/ping", (req, res) => {
    res.send("Courses API is working!");
});

/**
 * 📌 Lấy tất cả khóa học
 * GET /api/courses
 */
router.get("/", async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request().query("SELECT * FROM Courses");
        res.json(result.recordset);
    } catch (err) {
        console.error("❌ Error in GET /courses:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * 📌 Lấy khóa học theo ID
 * GET /api/courses/:id
 */
router.get("/:id", async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("course_id", sql.Int, req.params.id)
            .query("SELECT * FROM Courses WHERE course_id = @course_id");

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.json(result.recordset[0]);
    } catch (err) {
        console.error("❌ Error in GET /courses/:id:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * 📌 Thêm khóa học mới
 * POST /api/courses
 */
router.post("/create", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { course_name, description, level, created_by, is_free  } = req.body;

    if (!course_name || !level || typeof created_by === "undefined") {
        return res.status(400).json({ message: "Missing required fields: course_name, level, created_by" });
    }

    try {
        const pool = await poolPromise;
        const is_free = (is_free === undefined || is_free === null) ? 0 : (is_free ? 1 : 0);
        const checkCourse = await pool.request()
            .input("created_by", sql.Int, created_by)
            .query("SELECT COUNT(*) AS count FROM Courses WHERE created_by = @created_by");
        if (checkCourse.recordset[0].count === 0) {
            return res.status(400).json({ message: "Invalid created_by: employee not found" });
        }

        await pool.request()
            .input("course_name", sql.NVarChar(100), course_name)
            .input("description", sql.NVarChar(200), description || null)
            .input("level", sql.VarChar(20), level)
            .input("is_free", sql.Bit, is_free)
            .input("created_by", sql.Int, created_by)
            .query(`
                INSERT INTO Courses (course_name, description, level, created_by, is_free, created_at)
                VALUES (@course_name, @description, @level, @created_by, @is_free, GETDATE())
            `);

        res.status(201).json({ message: "✅ Course added successfully" });
    } catch (err) {
        console.error("❌ Error in POST /courses:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * 📌 Cập nhật khóa học
 * PUT /api/courses/:id
 */

router.put("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    const { course_name, description, level, created_by, is_free } = req.body;

    if (!course_name || !level || typeof created_by === "undefined") {
        return res.status(400).json({ message: "Missing required fields: course_name, level, created_by" });
    }

    try {
        const pool = await poolPromise;
        const is_free = (is_free === undefined || is_free === null) ? 0 : (is_free ? 1 : 0);
        const checkCourse = await pool.request()
            .input("created_by", sql.Int, created_by)
            .query("SELECT COUNT(*) AS count FROM Courses WHERE created_by = @created_by");
        if (checkCourse.recordset[0].count === 0) {
            return res.status(400).json({ message: "Invalid created_by: employee not found" });
        }
        await pool.request()
            .input("course_id", sql.Int, req.params.id)
            .input("course_name", sql.NVarChar(100), course_name)
            .input("description", sql.NVarChar(200), description || null)
            .input("level", sql.VarChar(20), level || 0)
            .input("is_free", sql.Bit, is_free)
            .input("created_by", sql.Int, created_by)
            .query(`
                UPDATE Courses
                SET course_name = @course_name,
                    description = @description,
                    level = @level,
                    is_free = @is_free
                    created_by = @created_by
                WHERE course_id = @course_id
            `);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.json({ message: "✅ Course updated successfully" });
    } catch (err) {
        console.error("❌ Error in PUT /courses/:id:", err.message);
        res.status(500).send("Server error");
    }
});

/**
 * 📌 Xóa khóa học
 * DELETE /api/courses/:id
 */
router.delete("/:id", verifyToken, authorizeRoles("admin", "employee"), async (req, res) => {
    try {
        const pool = await poolPromise;
        const result = await pool.request()
            .input("course_id", sql.Int, req.params.id)
            .query("DELETE FROM Courses WHERE course_id = @course_id");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Course not found" });
        }

        res.json({ message: "✅ Course deleted successfully" });
    } catch (err) {
        console.error("❌ Error in DELETE /courses/:id:", err.message);
        res.status(500).send("Server error");
    }
});

module.exports = router;
