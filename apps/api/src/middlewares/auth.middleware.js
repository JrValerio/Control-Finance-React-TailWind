import { verifyAuthToken } from "../services/auth.service.js";

export const authMiddleware = (req, res, next) => {
  const authorizationHeader = req.headers.authorization;

  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      message: "Token de autenticacao ausente ou invalido.",
    });
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();

  if (!token) {
    return res.status(401).json({
      message: "Token de autenticacao ausente ou invalido.",
    });
  }

  try {
    const payload = verifyAuthToken(token);

    req.user = {
      id: Number(payload.sub),
      email: payload.email,
    };

    return next();
  } catch {
    return res.status(401).json({
      message: "Token invalido ou expirado.",
    });
  }
};
