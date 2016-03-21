var properties = require(process.cwd() + '/properties/properties');
var restify = require('restify');
var speakeasy = require('speakeasy');
var mailer = require(process.cwd() + '/services/mailer');
var sms = require(process.cwd() + '/services/sms');
var simple_generator = require(process.cwd() + '/services/simple-generator');
var qrCode = require('qrcode-npm')
var userDb_controller = require(process.cwd() + '/controllers/' + properties.esup.userDb);

exports.initialize = function(mongoose_instance, callback) {
    initiatilize_user_model(mongoose_instance);
    console.log("mongoose models initialized");
    if (typeof(callback) === "function") callback();
}

/** User Model **/
var UserModel;

function initiatilize_user_model(mongoose) {
    var Schema = mongoose.Schema;

    var UserSchema = new Schema({
        uid: {
            type: String,
            required: true,
            unique: true
        },
        simple_generator: {
            code: String,
            validity_time: Number,
            active: {
                type: Boolean,
                default: false
            }
        },
        bypass: {
            codes: Array,
            active: {
                type: Boolean,
                default: false
            }
        },
        google_authenticator: {
            secret: Object,
            window: Number,
            active: {
                type: Boolean,
                default: false
            }
        },
    });

    mongoose.model('User', UserSchema, 'User');
    UserModel = mongoose.model('User');
}


/**
 * Envoie un code à l'utilisateur avec l'uid == req.params.uid et via la method == req.params.method
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
exports.send_code = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    switch (req.params.method) {
        case 'google_authenticator':
            send_code_google_authenticator(req, res, next);
            break;
        case 'simple_generator':
            send_code_simple_generator(req, res, next);
            break;
        case 'bypass':
            res.send({
                "code": "Error",
                "message": properties.messages.error.unvailable_method_operation
            });
            break;
        default:
            res.send({
                "code": "Error",
                "message": properties.messages.error.method_not_found
            });
            break;
    }
};

/**
 * Envoie le code via le transport == req.params.transport
 * Retourne la réponse du service mail
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function send_code_google_authenticator(req, res, next) {
    console.log("send_google_authenticator_mail :" + req.params.uid);
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            data[0].google_authenticator.window = properties.esup.methods.google_authenticator.mail_window;
            data[0].save(function() {
                switch (req.params.transport) {
                    case 'mail':
                        userDb_controller.send_mail(req.params.uid, function(mail) {
                            mailer.send_code(mail, speakeasy.totp({
                                secret: data[0].google_authenticator.secret.base32,
                                encoding: 'base32'
                            }), res);
                        }, res);
                        break;
                    case 'sms':
                        userDb_controller.send_sms(req.params.uid, function(num) {
                            sms.send_code(num, speakeasy.totp({
                                secret: data[0].google_authenticator.secret.base32,
                                encoding: 'base32'
                            }), res);
                        }, res);
                        break;
                    default:
                        res.send({
                            code: 'Error',
                            message: properties.messages.error.unvailable_method_transport
                        });
                        break;
                }
            });
        } else {
            var user = new UserModel();
            user.uid = req.params.uid;
            user.google_authenticator.secret = speakeasy.generateSecret({ length: 16 });
            user.google_authenticator.window = properties.esup.methods.google_authenticator.mail_window;
            user.save(function() {
                switch (req.params.transport) {
                    case 'mail':
                        userDb_controller.send_mail(req.params.uid, function(mail) {
                            mailer.send_code(mail, speakeasy.totp({
                                secret: user.google_authenticator.secret.base32,
                                encoding: 'base32'
                            }), res);
                        }, res);
                        break;
                    case 'sms':
                        userDb_controller.send_sms(req.params.uid, function(num) {
                            sms.send_code(num, speakeasy.totp({
                                secret: user.google_authenticator.secret.base32,
                                encoding: 'base32'
                            }), res);
                        }, res);
                        break;
                    default:
                        res.send({
                            code: 'Error',
                            message: properties.messages.error.unvailable_method_transport
                        });
                        break;
                }

            });
        }
    });
};

/**
 * Envoie le code via le transport == req.params.transport
 * Retourne la réponse du service mail
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function send_code_simple_generator(req, res, next) {
    console.log("send_simple_generator_mail :" + req.params.uid);

    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        var new_otp = {};
        switch (properties.esup.methods.simple_generator.code_type) {
            case "string":
                new_otp.code = simple_generator.generate_string_code(properties.esup.methods.simple_generator.code_length);
                break;
            case "digit":
                new_otp.code = simple_generator.generate_digit_code(properties.esup.methods.simple_generator.code_length);
                break;
            default:
                new_otp.code = simple_generator.generate_string_code(properties.esup.methods.simple_generator.code_length);
                break;
        }
        validity_time = properties.esup.methods.simple_generator.mail_validity * 60 * 1000;
        validity_time += new Date().getTime();
        new_otp.validity_time = validity_time;
        if (data[0]) {
            data[0].simple_generator = new_otp;
            data[0].save(function() {
                switch (req.params.transport) {
                    case 'mail':
                        userDb_controller.send_mail(req.params.uid, function(mail) {
                            mailer.send_code(mail, new_otp.code, res);
                        }, res);
                        break;
                    case 'sms':
                        userDb_controller.send_sms(req.params.uid, function(num) {
                            sms.send_code(num, new_otp.code, res);
                        }, res);
                        break;
                    default:
                        res.send({
                            code: 'Error',
                            message: properties.messages.error.unvailable_method_transport
                        });
                        break;
                }
            });
        } else {
            var user = new UserModel();
            user.uid = req.params.uid;
            user.simple_generator = new_otp;
            user.save(function() {
                switch (req.params.transport) {
                    case 'mail':
                        userDb_controller.send_mail(req.params.uid, function(mail) {
                            mailer.send_code(mail, new_otp.code, res);
                        }, res);
                        break;
                    case 'sms':
                        userDb_controller.send_sms(req.params.uid, function(num) {
                            sms.send_code(num, new_otp.code, res);
                        }, res);
                        break;
                    default:
                        res.send({
                            code: 'Error',
                            message: properties.messages.error.unvailable_method_transport
                        });
                        break;
                }
            });
        }
    });
};

/**
 * Vérifie si le code fourni correspond à celui stocké en base de données
 * si oui: on retourne un réponse positive et on supprime l'otp de la base de donnée
 * sinon: on renvoie une erreur 401 InvalidCredentialsError
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
exports.verify_code = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        verify_simple_generator(req, res, function(req, res) {
            verify_google_authenticator(req, res, function() {
                verify_bypass(req, res, function() {
                    res.send({
                        "code": "Error",
                        "message": properties.messages.error.invalid_credentials
                    });
                });
            });
        });
    });
};

/**
 * Vérifie si le code fourni correspond à celui stocké en base de données
 * si oui: on retourne un réponse positive et on supprime l'otp de la base de donnée
 * sinon: on renvoie une erreur 401 InvalidCredentialsError
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function verify_simple_generator(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0].simple_generator.active) {
            if (data[0].simple_generator.code == req.params.otp) {
                if (Date.now() < data[0].simple_generator.validity_time) {
                    UserModel.update({
                        'uid': req.params.uid
                    }, {
                        $set: {
                            simple_generator: {}
                        }
                    }, function(err, data) {
                        if (err) {
                            console.log(err)
                            next(req, res);
                        }
                        res.send({
                            "code": "Ok",
                            "message": properties.messages.success.valid_credentials
                        });
                    });
                } else {
                    next(req, res);
                }
            } else {
                next(req, res);
            }
        } else {
            next(req, res);
        }
    });
};


/**
 * Vérifie si le code fourni correspond à celui stocké en base de données
 * si oui: on retourne un réponse positive et on supprime l'otp de la base de donnée
 * sinon: on renvoie une erreur 401 InvalidCredentialsError
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function verify_bypass(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0].bypass.active) {
            if (data[0].bypass.codes) {
                var checkOtp = false;
                var codes = data[0].bypass.codes;
                for (code in codes) {
                    if (data[0].bypass.codes[code] == req.params.otp) {
                        checkOtp = true;
                        codes.splice(code, 1);
                    }
                }
                if (checkOtp) {
                    UserModel.update({
                        'uid': req.params.uid
                    }, {
                        $set: {
                            bypass: {
                                codes: codes
                            }
                        }
                    }, function(err, data) {
                        if (err) {
                            console.log(err)
                            next(req, res);
                        }
                        res.send({
                            "code": "Ok",
                            "message": properties.messages.success.valid_credentials
                        });
                    });
                } else {
                    next(req, res);
                }
            } else {
                next(req, res);
            }
        } else {
            next(req, res);
        }
    });
};


/**
 * Vérifie si l'otp fourni correspond à celui généré
 * si oui: on retourne un réponse positive
 * sinon: on renvoie une erreur 401 InvalidCredentialsError
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function verify_google_authenticator(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    var checkSpeakeasy = false;
    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (err) {
            console.log(err);
            next(req, res);
        } else if (data[0] == undefined) res.send({
            "code": "Error",
            "message": properties.messages.error.user_not_found
        });
        else {
            if (data[0].google_authenticator.active) {
                var transport_window = 0;
                checkSpeakeasy = speakeasy.totp.verify({
                    secret: data[0].google_authenticator.secret.base32,
                    encoding: 'base32',
                    token: req.params.otp,
                    window: data[0].google_authenticator.window
                });
                if (checkSpeakeasy) {
                    data[0].google_authenticator.window = properties.esup.methods.google_authenticator.default_window;
                    data[0].save(function() {
                        res.send({
                            "code": "Ok",
                            "message": properties.messages.success.valid_credentials
                        });
                    });
                } else {
                    next(req, res);
                }
            } else {
                next(req, res);
            }
        }
    });
};

/**
 * Génére un nouvel attribut d'auth (secret key ou matrice)
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
exports.generate = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    switch (req.params.method) {
        case 'google_authenticator':
            generate_google_authenticator(req, res, next);
            break;
        case 'simple_generator':
            res.send({
                "code": "Error",
                "message": properties.messages.error.unvailable_method_operation
            });
            break;
        case 'bypass':
            generate_bypass(req, res, next);
            break;
        default:
            res.send({
                "code": "Error",
                "message": properties.messages.error.method_not_found
            });
            break;
    }
};

/**
 * Retourne la réponse de la base de donnée suite à l'association d'un nouveau secret à l'utilisateur.
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function generate_google_authenticator(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    UserModel.update({
        'uid': req.params.uid
    }, {
        $set: {
            google_authenticator: {
                secret: speakeasy.generateSecret({ length: 16 })
            }
        }
    }, function(err, raw) {
        if (err) return handleError(err);
        res.send(raw);
    })
};

/**
 * Retourne la réponse de la base de donnée suite à la génération de nouveau bypass codes
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function generate_bypass(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    var codes = new Array();
    for (var it = 0; it < properties.esup.methods.bypass.codes_number; it++) {
        switch (properties.esup.methods.simple_generator.code_type) {
            case "string":
                codes.push(simple_generator.generate_string_code(properties.esup.methods.bypass.code_length));
                break;
            case "digit":
                codes.push(simple_generator.generate_digit_code(properties.esup.methods.bypass.code_length));
                break;
            default:
                codes.push(simple_generator.generate_string_code(properties.esup.methods.bypass.code_length));
                break;
        }
    }
    UserModel.update({
        'uid': req.params.uid
    }, {
        $set: {
            bypass: {
                codes: codes
            }
        }
    }, function(err, raw) {
        if (err) return handleError(err);
        res.send(raw);
    })
};


/**
 * Renvoie le secret de l'utilisateur afin qu'il puisse l'entrer dans son appli smartphone
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
exports.get_google_authenticator_secret = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");
    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            var qr = qrCode.qrcode(4, 'M');
            qr.addData(data[0].google_authenticator.secret.otpauth_url);
            qr.make();
            mailer.sendQRCode(data[0].mail, data[0].google_authenticator.secret.base32, qr.createImgTag(4), res);
        } else res.send({
            "code": "Error",
            "message": properties.messages.error.user_not_found
        });
    });
};

/**
 * Active la méthode l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
exports.activate_method = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    switch (req.params.method) {
        case 'google_authenticator':
            activate_google_authenticator(req, res, next);
            break;
        case 'simple_generator':
            activate_simple_generator(req, res, next);
            break;
        case 'bypass':
            activate_bypass(req, res, next);
            break;
        default:
            res.send({
                "code": "Error",
                "message": properties.messages.error.method_not_found
            });
            break;
    }
};

/**
 * Active la méthode google auth pour l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function activate_google_authenticator(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            data[0].google_authenticator.active = true;
            data[0].save(function() {
                res.send({
                    "code": "Ok",
                    "message": ""
                });
            });
        } else {
            next(req, res);
        }
    });
};

/**
 * Active la méthode simple_generator pour l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function activate_simple_generator(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            data[0].simple_generator.active = true;
            data[0].save(function() {
                res.send({
                    "code": "Ok",
                    "message": ""
                });
            });
        } else {
            next(req, res);
        }
    });
};

/**
 * Active la méthode bypass pour l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function activate_bypass(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            data[0].bypass.active = true;
            data[0].save(function() {
                res.send({
                    "code": "Ok",
                    "message": ""
                });
            });
        } else {
            next(req, res);
        }
    });
};


/**
 * Désctive la méthode l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
exports.deactivate_method = function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    switch (req.params.method) {
        case 'google_authenticator':
            deactivate_google_authenticator(req, res, next);
            break;
        case 'simple_generator':
            deactivate_simple_generator(req, res, next);
            break;
        case 'bypass':
            deactivate_bypass(req, res, next);
            break;
        default:
            res.send({
                "code": "Error",
                "message": properties.messages.error.method_not_found
            });
            break;
    }
};

/**
 * Désactive la méthode google auth pour l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function deactivate_google_authenticator(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            data[0].google_authenticator.active = false;
            data[0].save(function() {
                res.send({
                    "code": "Ok",
                    "message": ""
                });
            });
        } else {
            next(req, res);
        }
    });
};

/**
 * Désactive la méthode simple_generator pour l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function deactivate_simple_generator(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            data[0].simple_generator.active = false;
            data[0].save(function() {
                res.send({
                    "code": "Ok",
                    "message": ""
                });
            });
        } else {
            next(req, res);
        }
    });
};

/**
 * Désactive la méthode bypass pour l'utilisateur ayant l'uid req.params.uid
 *
 * @param req requete HTTP contenant le nom la personne recherchee
 * @param res reponse HTTP
 * @param next permet d'appeler le prochain gestionnaire (handler)
 */
function deactivate_bypass(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "X-Requested-With");

    UserModel.find({
        'uid': req.params.uid
    }).exec(function(err, data) {
        if (data[0]) {
            data[0].bypass.active = false;
            data[0].save(function() {
                res.send({
                    "code": "Ok",
                    "message": ""
                });
            });
        } else {
            next(req, res);
        }
    });
};

/**
 * Drop Users
 */
exports.drop = function(req, res, next) {
    UserModel.remove({}, function(err, data) {
        if (err) console.log(err);
        console.log('users removed');
        res.send(data);
    });
};