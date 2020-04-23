// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityTypes, ActivityHandler } = require('botbuilder');

class EmptyBot extends ActivityHandler {
    constructor() {
        super();
    }

    async onTurn(turnContext) {
        const text = turnContext.activity.text
        // Get News
        if (/^get news*/i.test(text)) {
            // Retrieve the news
            turnContext.sendActivity("I'll get the news for you");
        } else if (/^add.*/i.test(text)) {
            turnContext.sendActivity("Thanks I've added that to your list of approved categories");
        } else if (/^remove.*/i.test(text)) {
            // Remove a category
            turnContext.sendActivity("Thanks I've removed that from your list of approved categories");
        } else if (/^clear categories/i.test(text)) {
            // Clear all categories
            turnContext.sendActivity("Thanks cleared your list of approved soruces");
        } else {
            turnContext.sendActivity("Soryy, I didn't get you.")
        }
    }
}

module.exports.EmptyBot = EmptyBot;
