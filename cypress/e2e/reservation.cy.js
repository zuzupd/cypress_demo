describe('reservation form', () => {
    let tokenStep1 = '';
    let tokenStep2 = '';
    let tokenStep3 = ''; // kept in case you want to store it - not used later

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const formattedDate = `${tomorrow.getDate()}. ${tomorrow.getMonth() + 1}. ${tomorrow.getFullYear()} | 09:00`;

    beforeEach(() => {
        cy.visit('/');
        cy.get('#c-p-bn').click();
    });

    it('successful reservation', () => {
        // Selecting branch
        cy.get('[data-rel="reservation[branch_id]"]').click();
        cy.get('[data-name="reservation[branch_id]"]').within(() => {
            cy.get('label[for="branch_id_16"]')
              .should('be.visible')
              .click();
        });

        // Selecting tomorrow's date morning
        cy.get('#reservation_reservation_at').click();
        cy.get('.bootstrap-datetimepicker-widget')
          .should('be.visible')
          .within(() => {
            cy.get('[data-action="tomorrow"]')
              .should('be.visible')
              .wait(500)
              .click();
            cy.get('[data-action="close"]')
              .should('be.visible')
              .wait(500)
              .click();
          });

        // Selecting Shine program
        cy.get('[data-rel="reservation[program_id]"]').click();
        cy.get('[data-name="reservation[program_id]"]').within(() => {
            cy.get('label[for="program_id_1333"]')
              .should('be.visible')
              .click();
        });

        // Intercept POST for the first reservation step
        cy.intercept('POST', 'https://dev.automycka.cz/rezervace-1/', (req) => {
            const formData = new URLSearchParams(req.body);
            expect(formData.get('reservation[branch_id]')).to.equal("16");
            expect(formData.get('reservation[reservation_at]')).to.equal(formattedDate);
            expect(formData.get('reservation[program_id]')).to.equal("1333");
            tokenStep1 = formData.get('reservation[_token]');
        }).as('reservationPost');

        // Intercept POST for the finalization step
        cy.intercept('POST', 'https://dev.automycka.cz/rezervace-2/', (req) => {
            const formData = new URLSearchParams(req.body);
            expect(formData.get('reservation_finalize[customer_name]')).to.equal('Alex');
            expect(formData.get('reservation_finalize[customer_surname]')).to.equal('Johnson');
            expect(formData.get('reservation_finalize[customer_phone_number]')).to.equal('+420 123 456 789');
            expect(formData.get('reservation_finalize[customer_email]')).to.equal('alex@example.com');
            tokenStep2 = formData.get('reservation_finalize[_token]');
        }).as('reservationFinalizePost');

        // Intercept POST for summary confirmation (step 3) and abort it with 302
        cy.intercept('POST', 'https://dev.automycka.cz/rezervace-3/', (req) => {
            // We do not want to confirm the reservation
            req.reply({
                statusCode: 302,
                headers: { location: 'https://dev.automycka.cz/rezervace-1/' }
            });
        }).as('reservationSummaryPost');

        // Intercept GET for confirmation page and return our custom response
        cy.intercept('GET', 'https://dev.automycka.cz/rezervace-1/', (req) => {
            req.reply({
                statusCode: 200,
                body: `<div class="confirmation">
        <header>
            <h2 class="heading bordered">Rezervace</h2>
        </header>
        <p>Děkujeme za objednávku.<br> Těšíme se na Vaši návštěvu.</p>
        <script>
            gtag('event', 'conversion', {
                'event_category': 'form',
                'event_action': 'sent',
                'event_label': 'rezervace'
            });
        </script>
    </div>`
            });
        }).as('reservationConfirmation');

        // Sending first form (this triggers the POST to /rezervace-1/)
        cy.get('button[type="submit"]').click();

        // Checking first form was correctly submitted
        cy.wait('@reservationPost').then(() => {
            expect(tokenStep1, 'Token from step 1 should be stored').to.exist;
        });

        // Filling contact information
        cy.get('#reservation_finalize_customer_name').type('Alex');
        cy.get('#reservation_finalize_customer_surname').type('Johnson');
        cy.get('#reservation_finalize_customer_phone_number').type('+420123456789');
        cy.get('#reservation_finalize_customer_email').type('alex@example.com');

        // Submitting contact information (triggers POST to /rezervace-2/)
        cy.get('#reservation_submit').click();

        // Checking second form was correctly submitted
        cy.wait('@reservationFinalizePost').then(() => {
            expect(tokenStep2, 'Token from step 2 should be stored').to.exist;
        });

        // Confirming GDPR (clicking visible label for hidden checkbox)
        cy.get('label[for="reservation_summary_terms"]').click();

        // Submitting GDPR triggers POST to /rezervace-3/ (which replies with 302)
        cy.get('#reservation_submit').click();
        
        cy.wait('@reservationSummaryPost');

        // Now, check that the confirmation GET returns our simulated page
        cy.wait('@reservationConfirmation');
    });
});
