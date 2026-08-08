const mongoose = require('mongoose');
const { MASTER_CONSTANTS } = require('../config/constants');

const masterProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    professions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Profession' }],
    bio: { type: String, default: '' },
    rating: { type: Number, default: 0 },
    rating_count: { type: Number, default: 0 },
    is_available: { type: Boolean, default: true },
    experience_years: { type: Number, default: 0 },
    balance: { type: Number, default: MASTER_CONSTANTS.INITIAL_BALANCE },
  },
  { timestamps: false }
);

masterProfileSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('MasterProfile', masterProfileSchema);
