const swaggerJSDoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Recording Studio API',
      version: '1.0.0',
      description: 'API for managing recording studios',
    },
    servers: [
      {
        url: 'http://localhost:5000/api/auth',
      },
    ],
  },
  apis: ['./routes/*.js'], // सभी रूट फाइल्स को स्कैन करें
};

const swaggerSpec = swaggerJSDoc(options);
module.exports = swaggerSpec;