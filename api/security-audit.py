import os
import re

endpoints_to_check = [
    "/api/admin/dashboard",
    "/api/admin/user/",
    "/api/admin/ai-analysis"
]

warnings = []

# Check Admin Routes for proper middleware
admin_routes_path = "/Users/jameelkhabaze/JAKH/api/src/routes/admin.ts"
with open(admin_routes_path, 'r') as f:
    content = f.read()
    if "router.use(requireAdmin)" not in content:
        warnings.append("Security Alert: Admin routes might not be globally protected.")

# Check Auth Routes for hardcoded secrets
auth_routes_path = "/Users/jameelkhabaze/JAKH/api/src/routes/auth.ts"
with open(auth_routes_path, 'r') as f:
    content = f.read()
    if "JWT_SECRET = 'secret'" in content or "JWT_SECRET || 'secret'" in content:
        warnings.append("Vulnerability Found: Hardcoded JWT secret used. Needs cleanup.")

# Check for User Password Exposure in JSON
if "select: { id: true, username: true, email: true" in content:
    pass # This is fine, passwords excluded
else:
    warnings.append("Potential Leak: Check if password field is being returned in any user lists.")

if warnings:
    print("--- SECURITY AUDIT WARNINGS ---")
    for w in warnings:
        print(f"X {w}")
else:
    print("Basic security audit passed.")
