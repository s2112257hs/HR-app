import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Eye, EyeOff, Building2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { friendlyApiMessage } from "../../utilities/formErrors";
import { useAuth } from "./AuthProvider";

const loginSchema = z.object({
  orgCode: z.string().trim().min(1, "Org Code is required.").regex(/^\d{4}$/, "Org Code must be a 4-digit number (e.g. 0001)."),
  login: z.string().trim().min(1, "Username or email is required."),
  password: z.string().min(1, "Password is required.").min(8, "Password must be at least 8 characters.")
});

type LoginForm = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting }
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      orgCode: "0001",
      login: "admin@example.com",
      password: "admin123"
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values.login, values.password, values.orgCode);
      const from = (location.state as { from?: string } | null)?.from ?? "/roster/weekly";
      void navigate(from, { replace: true });
    } catch (error) {
      setError("root", {
        message: friendlyApiMessage(error, "Sign in failed. Check your Org Code, email, and password.")
      });
    }
  });

  return (
    <main className="login-page">
      <form className="login-panel" onSubmit={onSubmit}>
        <div className="login-heading">
          <div className="brand-mark">
            <CalendarDays size={20} aria-hidden="true" />
          </div>
          <h1>HR Roster</h1>
        </div>
        <label>
          Organisation Code (4 digits)
          <div className="input-with-icon" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Building2 size={16} aria-hidden="true" style={{ color: "var(--color-text-secondary, #6b7280)" }} />
            <input placeholder="0001" maxLength={4} {...register("orgCode")} style={{ textTransform: "uppercase" }} />
          </div>
          {errors.orgCode && <span className="field-error">{errors.orgCode.message}</span>}
        </label>
        <label>
          Username or email
          <input autoComplete="username" {...register("login")} />
          {errors.login && <span className="field-error">{errors.login.message}</span>}
        </label>
        <label>
          Password
          <span className="password-input-row">
            <input type={showPassword ? "text" : "password"} autoComplete="current-password" {...register("password")} />
            <button className="icon-button" type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
            </button>
          </span>
          {errors.password && <span className="field-error">{errors.password.message}</span>}
        </label>
        {errors.root && <div className="form-error">{errors.root.message}</div>}
        <button className="primary-button" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </main>
  );
}
