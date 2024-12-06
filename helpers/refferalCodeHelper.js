const mongoose = require('mongoose');

exports.generateReferralCode = async (username) => {
    const baseCode = username.replace(/\s+/g, '').toLowerCase();
    const generateTwoDigitSuffix = () => Math.floor(10 + Math.random() * 90).toString();

    let referralCode;
    let isUnique = false;

    while (!isUnique) {
        referralCode = `${baseCode}${generateTwoDigitSuffix()}`;
        const existingUser = await mongoose.models.User.findOne({ referralCode });
        if (!existingUser) isUnique = true;
    }

    return referralCode;
};