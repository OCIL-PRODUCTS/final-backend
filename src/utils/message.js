var moment = require('moment');

var generateMessage = (from, text) => {
  return {
    from,
    text,
    createdAt: moment().valueOf()
  };
};

const path = require('path');
const generateFiles = (from, filename) => {
  const ext = path.extname(filename).toLowerCase();
  const isImage = ['.png', '.jpg', '.jpeg', '.gif'].includes(ext);
  return {
      from,
      url: filename,  // Make sure the property is named 'url'
      createdAt: new Date().getTime(),
      isImage,
  };
};


module.exports = {generateMessage, generateFiles};
