import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarDays, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { friendlyApiMessage } from "../../utilities/formErrors";
import { useAuth } from "./AuthProvider";

const loginSchema = z.object({
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
      login: "admin@example.com",
      password: "admin123"
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    try {
      await login(values.login, values.password);
      const from = (location.state as { from?: string } | null)?.from ?? "/roster/weekly";
      void navigate(from, { replace: true });
    } catch (error) {
      setError("root", {
        message: friendlyApiMessage(error, "Sign in failed. Check your email and password.")
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
