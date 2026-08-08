const mongoose = require('mongoose');

const professionSchema = new mongoose.Schema(
  {
    name_uz: { type: String, required: true },
    name_ru: { type: String, default: '' },
    icon: { type: String, default: '' },
  },
  { timestamps: false }
);

professionSchema.set('toJSON', {
  versionKey: false,
  transform: (doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    return ret;
  },
});

module.exports = mongoose.model('Profession', professionSchema);
