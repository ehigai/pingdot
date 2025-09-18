export const jwtConstants = {
  secret: process.env.JWT_SECRET,
  refreshSecret: process.env.REFRESH_SECRET,
};

export const authErrorConstants = {
  invalidAccessToken: 'InvalidAccessToken',
};

export const appConstants = {
  port: process.env.PORT || 3000,
  allowedOrigins: process.env.FRONTEND_URL || 'http://localhost:5173',
};
