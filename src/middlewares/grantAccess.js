import { roles } from '../roles';
import Boom from "@hapi/boom"; // Preferred

const grantAccess = (action, resource) => {
  return async (req, res, next) => {
    if (!req.payload || !req.payload.role) {
      return res.status(403).json({ message: 'Access denied: no role found' });
    }
    const permission = roles.can(req.payload.role)[action](resource);

    if (!permission.granted) {
      //return next(Boom.unauthorized("You don't have permission."));
    }

    next();
  };
};

export default grantAccess;