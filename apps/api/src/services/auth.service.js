import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const usersByEmail = new Map();
let nextUserId = 1;

const DEFAULT_JWT_SECRET = "control-finance-dev-secret";
const DEFAULT_JWT_EXPIRES_IN = "24h";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const sanitizeUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
});

const getJwtSecret = () => process.env.JWT_SECRET || DEFAULT_JWT_SECRET;

const getJwtExpiresIn = () =>
  process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN;

const getNormalizedEmail = (email) =>
  typeof email === "string" ? email.trim().toLowerCase() : "";

const validateCredentials = ({ email, password }) => {
  const normalizedEmail = getNormalizedEmail(email);
  const normalizedPassword = typeof password === "string" ? password.trim() : "";

  if (!normalizedEmail || !normalizedPassword) {
    throw createError(400, "Email e senha sao obrigatorios.");
  }

  if (normalizedPassword.length < 6) {
    throw createError(400, "A senha deve ter no minimo 6 caracteres.");
  }

  return { normalizedEmail, normalizedPassword };
};

export const registerUser = async ({ name = "", email, password }) => {
  const { normalizedEmail, normalizedPassword } = validateCredentials({
    email,
    password,
  });

  if (usersByEmail.has(normalizedEmail)) {
    throw createError(409, "Usuario ja cadastrado.");
  }

  const passwordHash = await bcrypt.hash(normalizedPassword, 10);

  const user = {
    id: nextUserId,
    name: typeof name === "string" ? name.trim() : "",
    email: normalizedEmail,
    passwordHash,
  };

  usersByEmail.set(normalizedEmail, user);
  nextUserId += 1;

  return sanitizeUser(user);
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = getNormalizedEmail(email);
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !normalizedPassword) {
    throw createError(400, "Email e senha sao obrigatorios.");
  }

  const user = usersByEmail.get(normalizedEmail);

  if (!user) {
    throw createError(401, "Credenciais invalidas.");
  }

  const passwordMatches = await bcrypt.compare(
    normalizedPassword,
    user.passwordHash,
  );

  if (!passwordMatches) {
    throw createError(401, "Credenciais invalidas.");
  }

  const token = jwt.sign(
    {
      sub: String(user.id),
      email: user.email,
    },
    getJwtSecret(),
    { expiresIn: getJwtExpiresIn() },
  );

  return {
    token,
    user: sanitizeUser(user),
  };
};

export const verifyAuthToken = (token) => jwt.verify(token, getJwtSecret());

export const __resetAuthStoreForTests = () => {
  usersByEmail.clear();
  nextUserId = 1;
};
