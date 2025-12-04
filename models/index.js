const mongoose = require('mongoose');
const User = require('./User');
const Studio = require('./Studio');
const Album = require('./Album');
const Plan = require('./Plan')
const Booking = require('./booking');
const Counter = require('./Counter');
const SkillCategory = require('./SkillCategory');
const Skill = require('./Skill');
const Settings = require('./Settings');
const Payment = require('./Payment');
const Bid = require('./Bid');
const ProjectWork = require('./ProjectWork');
const ChatMessage = require('./ChatMessage');
const Project = require('./Project');
const Subscription= require('./Subscription');
const UserSubscription= require('./UserSubscription');
const Review =require('./Review')
const ProjectPayment = require('./ProjectPayment');
const Notification = require('./Notification');
const PaymentTransactions = require('./PaymentTransactions');
const Task = require('./Task');
const Reward = require('./Reward');
const Event = require('./Event');

module.exports = {
  User,
  Skill,
  Studio,
  Album,
  Plan,
  Booking,
  Counter,
  SkillCategory,
  Settings,
  Payment,
  Bid,
  Project,
  ProjectWork,
  Subscription,
  UserSubscription,
  Review,
  ProjectPayment,
  Notification,
  ChatMessage,
  PaymentTransactions,
  Task,
  Reward,
  Event,
};