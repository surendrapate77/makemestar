const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

const authorizeStudio = (req, res, next) => {
  if (!req.user || req.user.role !== 'studio') {
    return res.status(403).json({ message: 'Only users with studio role are authorized' });
  }
  next();
};

const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only users with admin role are authorized' });
  }
  next();
};

const authorizeManager = (req, res, next) => {
  if (!req.user || req.user.role !== 'manager') {
    return res.status(403).json({ message: 'Only users with manager role are authorized' });
  }
  next();
};

const authorizeAccountant = (req, res, next) => {
  if (!req.user || req.user.role !== 'accountant') {
    return res.status(403).json({ message: 'Only users with accountant role are authorized' });
  }
  next();
};

module.exports = { auth, authorizeStudio, authorizeAdmin, authorizeManager, authorizeAccountant };