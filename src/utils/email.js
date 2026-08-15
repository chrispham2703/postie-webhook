const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);
async function sendEndpointFailureAlert({ to, appName, endpointUrl }){
    return await resend.emails.send({
    from: 'onboarding@resend.dev',
        to,
        subject: `Endpoint delivery failed for ${appName}`,
        html: `<p>Endpoint <strong>${endpointUrl}</strong> of application <strong>${appName}</strong> has failed all retry
  attempts and will not be retried again.</p>`,
});
}
module.exports = { sendEndpointFailureAlert };