import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { dbQuery } from "../db/index.js";

const DEFAULT_JWT_SECRET = "control-finance-dev-secret";
const DEFAULT_JWT_EXPIRES_IN = "24h";
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const WEAK_PASSWORD_MESSAGE =
  "Senha fraca: use no minimo 8 caracteres com letras e numeros.";

const createError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const sanitizeUser = (user) => ({
  id: Number(user.id),
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

  return { normalizedEmail, normalizedPassword };
};

const validatePasswordStrength = (password) => {
  if (!PASSWORD_REGEX.test(password)) {
    throw createError(400, WEAK_PASSWORD_MESSAGE);
  }
};

export const registerUser = async ({ name = "", email, password }) => {
  const { normalizedEmail, normalizedPassword } = validateCredentials({
    email,
    password,
  });
  validatePasswordStrength(normalizedPassword);

  const normalizedName = typeof name === "string" ? name.trim() : "";
  const passwordHash = await bcrypt.hash(normalizedPassword, 10);

  try {
    const result = await dbQuery(
      `
        INSERT INTO users (name, email, password_hash)
        VALUES ($1, $2, $3)
        RETURNING id, name, email
      `,
      [normalizedName, normalizedEmail, passwordHash],
    );

    return sanitizeUser(result.rows[0]);
  } catch (error) {
    if (error.code === "23505") {
      throw createError(409, "Usuario ja cadastrado.");
    }

    throw error;
  }
};

export const loginUser = async ({ email, password }) => {
  const normalizedEmail = getNormalizedEmail(email);
  const normalizedPassword = typeof password === "string" ? password : "";

  if (!normalizedEmail || !normalizedPassword) {
    throw createError(400, "Email e senha sao obrigatorios.");
  }

  const result = await dbQuery(
    `
      SELECT id, name, email, password_hash
      FROM users
      WHERE email = $1
      LIMIT 1
    `,
    [normalizedEmail],
  );

  if (result.rows.length === 0) {
    throw createError(401, "Credenciais invalidas.");
  }

  const user = result.rows[0];
  const passwordMatches = await bcrypt.compare(
    normalizedPassword,
    user.password_hash,
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
