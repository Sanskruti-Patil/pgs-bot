// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { TimexProperty } = require('@microsoft/recognizers-text-data-types-timex-expression');
const { MessageFactory, InputHints } = require('botbuilder');
const { LuisRecognizer } = require('botbuilder-ai');
const { ComponentDialog, DialogSet, DialogTurnStatus, TextPrompt, WaterfallDialog } = require('botbuilder-dialogs');

const MAIN_WATERFALL_DIALOG = 'mainWaterfallDialog';

class MainDialog extends ComponentDialog {
    constructor(luisRecognizer, orderDialog) {
        super('MainDialog');

        if (!luisRecognizer) throw new Error('[MainDialog]: Missing parameter \'luisRecognizer\' is required');
        this.luisRecognizer = luisRecognizer;

        if (!orderDialog) throw new Error('[MainDialog]: Missing parameter \'orderDialog\' is required');

        // Define the main dialog and its related components.
        // This is a "Place an Order" dialog.
        this.addDialog(new TextPrompt('TextPrompt'))
            .addDialog(orderDialog)
            .addDialog(new WaterfallDialog(MAIN_WATERFALL_DIALOG, [
                this.introStep.bind(this),
                this.actStep.bind(this),
                this.finalStep.bind(this)
            ]));

        this.initialDialogId = MAIN_WATERFALL_DIALOG;
    }

    /**
     * The run method handles the incoming activity (in the form of a TurnContext) and passes it through the dialog system.
     * If no dialog is active, it will start the default dialog.
     * @param {*} turnContext
     * @param {*} accessor
     */
    async run(turnContext, accessor) {
        const dialogSet = new DialogSet(accessor);
        dialogSet.add(this);

        const dialogContext = await dialogSet.createContext(turnContext);
        const results = await dialogContext.continueDialog();
        if (results.status === DialogTurnStatus.empty) {
            await dialogContext.beginDialog(this.id);
        }
    }

    /**
     * First step in the waterfall dialog. Prompts the user for a command.
     * Currently, this expects a ordering request, like "deliver me rice on march 22"
     * Note that the sample LUIS model will only recognize rice, sugar, wheat etc as grocesry items.
     */
    async introStep(stepContext) {
        if (!this.luisRecognizer.isConfigured) {
            const messageText = 'NOTE: LUIS is not configured. To enable all capabilities, add `LuisAppId`, `LuisAPIKey` and `LuisAPIHostName` to the .env file.';
            await stepContext.context.sendActivity(messageText, null, InputHints.IgnoringInput);
            return await stepContext.next();
        }

        const messageText = stepContext.options.restartMsg ? stepContext.options.restartMsg : 'What can I help you with today?\nSay something like "Deliver 10 kg rice on March 22, 2020"';
        const promptMessage = MessageFactory.text(messageText, messageText, InputHints.ExpectingInput);
        return await stepContext.prompt('TextPrompt', { prompt: promptMessage });
    }

    /**
     * Second step in the waterfall.  This will use LUIS to attempt to extract the delivery items and delivery dates.
     * Then, it hands off to the orderDialog child dialog to collect any remaining details.
     */
    async actStep(stepContext) {
        const orderDetails = {};

        if (!this.luisRecognizer.isConfigured) {
            // LUIS is not configured, we just run the OrderingDialog path.
            return await stepContext.beginDialog('orderDialog', orderDetails);
        }

        // Call LUIS and gather any potential booking details. (Note the TurnContext has the response to the prompt)
        const luisResult = await this.luisRecognizer.executeLuisQuery(stepContext.context);
        switch (LuisRecognizer.topIntent(luisResult)) {
        case 'PlaceOrder': {
            // Extract the values for the composite entities from the LUIS result.
            const deliverEntities = this.luisRecognizer.getDeliverEntities(luisResult);

            // Show a warning for items if we can't resolve them.
            await this.showWarningForUnsupportedItems(stepContext.context, deliverEntities);

            // Initialize OrderDetails with any entities we may have found in the response.
            orderDetails.item = deliverEntities.itemList;
            orderDetails.deliveryDate = this.luisRecognizer.getDeliveryDate(luisResult);
            console.log('LUIS extracted these order details:', JSON.stringify(orderDetails));

            // Run the OrderDialog passing in whatever details we have from the LUIS call, it will fill out the remainder.
            return await stepContext.beginDialog('orderDialog', orderDetails);
        }

        default: {
            // Catch all for unhandled intents
            const didntUnderstandMessageText = `Sorry, I didn't get that. Please try asking in a different way (intent was ${ LuisRecognizer.topIntent(luisResult) })`;
            await stepContext.context.sendActivity(didntUnderstandMessageText, didntUnderstandMessageText, InputHints.IgnoringInput);
        }
        }

        return await stepContext.next();
    }

    /**
     * Shows a warning if the requested items are recognized as entities but they are not in the ItemList entity list.
     * In some cases LUIS will recognize the deliver composite entities as a valid items but the Deliver ItemList values
     * will be empty if those entity values can't be mapped to a canonical item in the ItemList.
     */
    async showWarningForUnsupportedItems(context, deliverEntities) {
        const unsupportedItems = [];

        if (deliverEntities.deliver && !deliverEntities.itemList) {
            unsupportedItems.push(deliverEntities.deliver);
        }

        if (unsupportedItems.length) {
            const messageText = `Sorry but the following items are not deliverable: ${ unsupportedItems.join(', ') }`;
            await context.sendActivity(messageText, messageText, InputHints.IgnoringInput);
        }
    }

    /**
     * This is the final step in the main waterfall dialog.
     * It wraps up the sample "place an order" interaction with a simple confirmation.
     */
    async finalStep(stepContext) {
        // If the child dialog ("orderDialog") was cancelled or the user failed to confirm, the Result here will be null.
        if (stepContext.result) {
            const result = stepContext.result;
            // Now we have all the order details.

            // If the call to the ordering service was successful tell the user.
            const timeProperty = new TimexProperty(result.deliveryDate);
            const deliveryDateMsg = timeProperty.toNaturalLanguage(new Date(Date.now()));
            const msg = `I have ordered you ${ result.item } on ${ deliveryDateMsg }.`;
            await stepContext.context.sendActivity(msg, msg, InputHints.IgnoringInput);
        }

        // Restart the main dialog with a different message the second time around
        return await stepContext.replaceDialog(this.initialDialogId, { restartMsg: 'What else can I do for you?' });
    }
}

module.exports.MainDialog = MainDialog;
