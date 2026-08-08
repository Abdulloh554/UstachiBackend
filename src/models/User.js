const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, unique: true, trim: true },
    username: { type: String, default: '' },
    email: { type: String, default: '' },
    first_name: { type: String, default: '' },
    last_name: { type: String, default: '' },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.CLIENT },
    password: { type: String, required: true },
    avatar: { type: String, default: null },
    language: { type: String, default: 'uz' },
    theme: { type: String, default: 'light' },
    location_lat: { type: Number, default: null },
    location_lng: { type: Number, default: null },
    is_staff: { type: Boolean, default: false },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.password;
    return ret;
  },
});

userSchema.methods.toUserJSON = function () {
  const obj = this.toObject();
  return {
    id: obj._id.toString(),
    phone: obj.phone,
    username: obj.username,
    role: obj.role,
    avatar: obj.avatar,
    language: obj.language,
    theme: obj.theme,
    location_lat: obj.location_lat,
    location_lng: obj.location_lng,
    first_name: obj.first_name,
    last_name: obj.last_name,
  };
};

userSchema.methods.getFullName = function () {
  return [this.first_name, this.last_name].filter(Boolean).join(' ').trim();
};

module.exports = mongoose.model('User', userSchema);
