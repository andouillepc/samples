/** 
 * @fileOverview Eligibility API call from iOS users when attempting to purchase.
 * @author Maxime Servonnet
 * @module api/eligibility
 */
var Utils = require( "./utils/utils" );
var appStoreAPI = require( "./subscription/appStore.api" );
var UserManagement = require( "./utils/user" );

exports.Setup = function( app ) {
	app.post( "/api/user/subscribe/eligibility/", UserEligibility );
}

/**
 * Checking the user eligibility. The app receipt is unique per Apple ID and an Apple ID can only be used once. 
 * An Apple ID can be reused by another account only if there's active subscription.
 * Therefore, we verify that this App Receipt has no active subscription attached to it.
 * @param {string} username - user requesting eligibility
 * @param {base64} app_recepit - app receipt used to verify the user's eligibility
 */
function UserEligibility( req, res ) {
	var params = {
		username: req.body.username,
		app_receipt: req.body.app_receipt,
	};

	// Parsing the App Receipt from the App Store
	appStoreAPI.getAppReceiptJSON( params.app_receipt, function( data ) {
		if ( data.error ) {
			res.json( data );
			return Utils.Log( req.logEntry, data.error.message, 3 );
		}

		// App Receipt has no purchase, all good. ( ie. it's a new user and a new Apple ID )
		var receipt = data.receipt;
		if ( !receipt.in_app.length ) {
			UserManagement.Find( params.username, function( user ) {
				if ( user && user.subscription.transactionId ) {
					res.json( {
						available: false,
						reason: "providedUsernameAlreadyLinkedToAnotherAppReceipt"
					} );
					Utils.Log( req.logEntry, "Provided username already linked to another app receipt", 2 );
				} else {
					res.json( {
						available: true,
						reason: "noPurchaseInAppReceipt"
					});
					Utils.Log( req.logEntry, "No purchase in app receipt.", 1 );
				}
			});
			return;
		}

		// App Receipt has at least one periodic purchase. We get the transaction ID and look for it in our DB.
		var purchase = receipt.in_app[ 0 ];
		UserManagement.FindBy( {
			"subscription.transactionId": purchase.original_transaction_id
		}, function( user ) {
			if ( !user ) {
				// User doesn't exists. It probably existed and got deleted. The Apple ID can be reattached.
				UserManagement.Find( params.username, function( user2 ) {
					if ( !user2 || !user2.subscription.transactionId ) {
						res.json( {
							available: true,
							reason: "noUserLinkedToAppReceipt"
						} );
						Utils.Log( req.logEntry, "No user linked to this app receipt", 1 );
					} else {
						res.json( {
							available: false,
							reason: "providedUsernameAlreadyLinkedToAnotherAppReceipt"
						} );
						Utils.Log( req.logEntry, "Provided username already linked to another app receipt", 2 );
					}
				});
			} else if ( user.username == params.username ) {
				// The user found is the one requesting the eligibility call. It's fine.
				res.json( {
					available: true,
					reason: "appReceiptLinkedToThisUser"
				} );
				Utils.Log( req.logEntry, "App receipt linked to this user", 1 );
			} else {
				// Another user is using this Apple ID, it's then ineligible.
				res.json( {
					available: false,
					reason: "appReceiptLinkedToAnotherUser"
				} );
				Utils.Log( req.logEntry, "App receipt linked to another user", 2 );
			}
		} );
	} );
}