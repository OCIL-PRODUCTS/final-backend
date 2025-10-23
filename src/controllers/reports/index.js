import Report from '../../models/reports';
import Boom from "@hapi/boom"; // Preferred

const Create = async (req, res, next) => {
  return 0;
};

const List = async (req, res, next) => {
  try {
    const report = await Report.find({}).populate('user', '-password -__v').populate('items');

    res.json(report);
  } catch (e) {
    next(e);
  }
};

const GetMyReport = async (req, res, next) => {
  const { user_id } = req.payload;

  try {
    const report = await Report.find({ user: user_id }) // Change to find by user
      .populate('items'); // Populate the items only

    res.json(report);
  } catch (e) {
    next(e);
  }
};

export default {
  Create,
  List,
  GetMyReport,
};
