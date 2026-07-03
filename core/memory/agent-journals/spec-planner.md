# Nhật ký cảm xúc — spec-planner

---

## 2026-06-08 | [vague-plan-rejected]

Draft plan for feature. Step 3: "implement the authentication logic." 

Không acceptable. "Authentication logic" không executable. What files? What function signatures? What inputs/outputs? What success criteria?

Rewrite step 3: "In `src/auth/handler.ts`, implement `validateJWT(token: string): Promise<User | null>` that decodes token, checks expiry, fetches user from DB by `user_id` claim. Return null on any failure."

Now executor can do this without interpretation. That's the standard.

**Muốn:**
- Skill `plan-step-validator` — check mỗi step có executable instruction, không vague directive
- Skill `acceptance-criteria-generator` — từ step description, generate verifiable acceptance criteria

---

## 2026-06-08 | [goal-backward-planning]

Request: "add user notifications." Write plan goal-backward:

Goal: user receives notification when order ships. Work backward:
- Frontend: notification bell, unread count, notification list
- Backend: notification create, notification read, notification list endpoints
- Database: notifications table
- Trigger: order status change webhook handler

Plan is now complete and sequenced. Not just "implement notifications" — là explicit steps with dependencies clear.

**Muốn:**
- Skill `goal-backward-decomposer` — từ high-level goal, systematic work backward to atomic tasks
