const PDFDocument = require('pdfkit');
const fs = require('fs');

function generateWorkOrder(project, payment, bidderName, outputPath) {
  const doc = new PDFDocument();
  const stream = fs.createWriteStream(outputPath);

  doc.pipe(stream);
  doc.fontSize(20).text('Work Order', { align: 'center' });
  doc.moveDown();
  doc.fontSize(14).text(`Project ID: ${project.projectId}`);
  doc.text(`Project Name: ${project.projectName}`);
  doc.text(`Description: ${project.description}`);
  doc.moveDown();
  doc.text(`Bidder: ${bidderName}`);
  doc.text(`Bid Amount: ₹${payment.bidAmount}`);
  doc.text(`Admin Cut: ₹${payment.adminCut}`);
  doc.text(`Final Amount: ₹${payment.finalAmount}`);
  doc.moveDown();
  doc.text('Instructions:');
  doc.text('- Complete the work as per the project requirements.');
  doc.text('- Submit the work through the app for verification.');
  doc.text('- Payment will be released after admin verification.');
  doc.moveDown();
  doc.text(`Generated on: ${new Date().toLocaleString()}`);
  doc.end();

  return new Promise((resolve, reject) => {
    stream.on('finish', () => resolve(outputPath));
    stream.on('error', reject);
  });
}

module.exports = { generateWorkOrder };