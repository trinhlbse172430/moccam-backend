// 📘 swagger.js – Cấu hình Swagger hoàn chỉnh cho hệ thống PayOS + Learning Platform

const swaggerJsDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

// ⚙️ Cấu hình Swagger (OpenAPI 3.0)
const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "🎓 Learning Management API Documentation",
      version: "1.0.0",
      description: `
## 📘 Giới thiệu

Đây là **tài liệu API** cho hệ thống **Nền tảng học trực tuyến** bao gồm quản lý người dùng, thanh toán, bài học, và các mô-đun AI.

---

### 💡 Nhóm API chính:
- 👤 **Users** – Quản lý người dùng & vai trò
- 🔐 **Authentication** – Đăng nhập, đăng ký, xác thực Google
- 💳 **Payments (PayOS)** – Xử lý thanh toán
- 🎓 **Courses & Lessons** – Quản lý khóa học, bài học
- 🏷️ **Vouchers** – Quản lý mã giảm giá
- 🧩 **Resources** – Tài nguyên học tập
- 🧠 **AI Models** – Mô hình AI học nhạc
- ✋ **Hand Motions** – Theo dõi chuyển động tay
- 💬 **Comments** – Bình luận & đánh giá bài học
- 🔔 **Notifications** – Thông báo người dùng
- 📈 **Customer Progress** – Theo dõi tiến độ học

---

✅ **Phiên bản:** 1.0.0  
👨‍💻 **Nhóm phát triển:** Mộc Cầm Dev Team  
📧 **Liên hệ hỗ trợ:** moccam.business@gmail.com
      `,
      contact: {
        name: "Mộc Cầm API Team",
        email: "moccam.business@gmail.com",
      },
      license: {
        name: "MIT License",
        url: "https://opensource.org/licenses/MIT",
      },
    },

    servers: [
      {
        url: "http://localhost:3000",
        description: "Local Development Server",
      },
      {
        url: "https://your-production-domain.com",
        description: "Production Server",
      },
    ],

    components: {
      // 🔐 Cấu hình xác thực JWT (Bearer Token)
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "🔑 Nhập token JWT vào đây (ví dụ: Bearer eyJhbGciOiJIUzI1NiIs...)",
        },
      },

      // 📦 Các schema mẫu (tái sử dụng trong routes)
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "✅ Operation completed successfully",
            },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "❌ An error occurred while processing your request",
            },
          },
        },
        AuthToken: {
          type: "object",
          properties: {
            token: {
              type: "string",
              example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
            },
            expiresIn: {
              type: "integer",
              example: 3600,
            },
          },
        },
      },
    },

    // 🚪 Mặc định bật Bearer Token cho các route cần xác thực
    security: [
      {
        bearerAuth: [],
      },
    ],
  },

  // 🧩 Vị trí các file route chứa swagger comment
  apis: ["./routes/*.js"],
};

// ✅ Sinh tài liệu Swagger (JSON spec)
const specs = swaggerJsDoc(options);

// 🎨 Tuỳ chỉnh giao diện Swagger UI
const swaggerUiOptions = {
  explorer: true,
  customCss: `
    .swagger-ui .topbar {
      background-color: #004aad !important;
    }
    .topbar-wrapper .link span {
      color: #ffffff !important;
      font-weight: bold;
    }
    .swagger-ui .scheme-container {
      background: #f5f7fa;
      border-radius: 8px;
      padding: 8px;
    }
    .swagger-ui .info hgroup.main a {
      color: #004aad !important;
    }
    .swagger-ui .opblock.opblock-post {
      border-color: #00a86b;
    }
    .swagger-ui .opblock.opblock-get {
      border-color: #007bff;
    }
    .swagger-ui .opblock.opblock-put {
      border-color: #f39c12;
    }
    .swagger-ui .opblock.opblock-delete {
      border-color: #e74c3c;
    }
  `,
  customSiteTitle: "PayOS & Learning Management API Docs",
};

// 🚀 Xuất module để sử dụng trong server.js hoặc app.js
module.exports = {
  swaggerUi,
  specs,
  swaggerUiOptions,
};
