# AI for Business: daily reports to invoices, for tradies

> Week 10 business case. The business: an app that helps trade subcontractors (painters,
> electricians, plumbers) run their jobs, from quotes to getting paid. It connects to
> Xero/MYOB/QuickBooks. It has no AI yet. This is the case for adding one AI feature.
>
> Numbers marked *(guess)* are my estimates, to show the method.

---

## 1. How it works today

A painter with a crew of 3.

**Every evening**, the crew lead writes down:
1. Who worked, and how many hours
2. What got done
3. Any problems
4. Photos of the site

**Every Friday**, the owner:
1. Collects the 5 reports
2. Writes the invoice by hand
3. Sends it to the builder
4. Chases the payment if it's late

---

## 2. The idea

```
Crew lead records a 30-second voice note
  → AI turns it into the daily report
  → Friday: AI drafts the invoice from the 5 reports
  → ⏸ Owner checks and approves
  → Code adds up the total + GST and sends it
```

**AI writes the drafts. The owner approves. Code does the maths and the sending.**

---

## 3. The money

**Time spent today**
- Daily reports: 20 min × 5 days ≈ **1.7 hrs/week** *(guess)*
- Invoices, chasing payments, customer details: **7+ hrs/week** (survey of Australian tradies)
- **Total: 8.7 hrs/week**

**Saving**
- AI cuts that by about half *(guess)*: **4.35 hrs/week**
- Owner's time is worth about **$80/hr** *(guess)*
- 4.35 × $80 = **$348/week ≈ $1,392/month**

**Cost**
- AI: ~$5/month · Server: ~$10/month *(guesses)*
- **Total: $15/month**
- Building it once: 40 hrs × $50/hr = **$2,000**

**Result**
- **Saves about $1,377/month** for each customer
- **Pays for itself in about 1.5 months**, with just one customer

---

## 4. What could go wrong

| Problem | Fix |
|---|---|
| AI writes the wrong hours | The owner checks every invoice before it's sent |
| AI writes the wrong job name | The owner checks, and the job is picked from a list, not typed by AI |
| Invoice goes to the wrong builder | The address comes from the job record in code. AI never picks who to send to |
| The AI service is down | The crew lead types the report by hand, like today |

---

## 5. What stays human

- **Approving every invoice.** No money message goes out without the owner seeing it.

---

## 6. Where NOT to use AI

| Step | Who does it | Why |
|---|---|---|
| Understanding a voice note | AI | Messy words are what AI is good at |
| Writing the report | AI | Same |
| **Adding up money and GST** | **Code** | Must be right every time. AI can get maths wrong |
| **Sending the invoice** | **Code** | Only after approval, to the right address |
| **Payment reminders** | **Code** | A fixed rule: 7 days late, send a reminder |

**My rule:** AI for **messy** work, code for **exact** work.

---

## 7. What I'd tell the owner

> *"It saves you about 4 hours of paperwork a week. It costs $15 a month and saves you
> around $1,300 of your time. The AI only drafts, and you approve every invoice before it
> goes out."*

---

## How n8n fits (Week 11)

n8n ("nodemation") is a drag and drop tool that joins steps into an automatic chain.
Each arrow in section 2 would be one step in an n8n workflow.

## Sources

- https://servicetitan.com/blog/australia-how-to-save-time
- https://www.nextminute.com/au/blog/save-time-on-tradie-admin
- https://enterprisemonkey.com.au/ai-automation-tradies-practical-tools-trade-businesses/
