import log from "log";
import $ from "jquery";
import _ from "underscore";
import Backbone from "backbone";
import Bootstrap from "bootstrap";
import Handlebars from "handlebars";
import Accounting from "accounting";
import MnWizardStep from "js/views/common/MnWizardStep";
import MnAdvSetupRuleView from "js/views/advSimulation/setup/rule/MnAdvSetupRuleView";
import HtmlTemplate from "text-loader!js/templates/advSimulation/setup/rule/MnAdvSetupRulesTemplate.html";
import MnAdvSimulationRuleCollection from "js/models/advSimulation/MnAdvSimulationRuleCollection";
import MnCountryCollection from "js/models/MnCountryCollection";
import MnCountryModel from "js/models/MnCountryModel";
import MnPickListView from "js/views/common/MnPickListView";
import MnMessageView from "js/views/common/MnMessageView";
import MnAdvSetupCountryReferencesView from "js/views/advSimulation/setup/rule/MnAdvSetupCountryReferencesView";
import MnAdvSimulationRemoteActions from "js/remoteActions/MnAdvSimulationRemoteActions";

    log.debug('MnAdvSetupRulesView.js loaded');

    var v = MnWizardStep.extend({
        template: Handlebars.compile(HtmlTemplate),
        title: 'Country Rules',
        simulation: null,
        rules: null,
        country: null,
        countryPickList: null,
        isPopup: false,
        // loadCountries: true,
        dirty: false,
        // checkDirty: true,
        loadedCountries: false,
        loadedRules: false,
        needImport: false,
        needDelete: false,
        threatFactorInited: 0,

        events: {
            'click .MnAddRule': 'onAddRule',
            'click .MnDeleteRule': 'onDeleteRule',
            'click .MnSaveRule': 'onSaveRules'
        },

        //Initialize - called when new instance is created
        initialize: function (options) {
            MnWizardStep.prototype.initialize.apply(this, [options]);
            log.debug('MnAdvSetupRulesView.initialize()');
            var view = this;
            if(!view.tabIndex){
                view.tabIndex = 0;
            }
            view.simulation = options.simulation;
            view.simulation.on("change:Mode2__c change:MnCountry__c", function () {
                view.loadedCountries = false;
                view.countryId = view.simulation.get('Id') ? view.simulation.get('MnCountry__c') : null;
                view.model.set({'countryId': view.countryId},{silent:true});
                if(view.simulation.get('Id')){
                    view.rules.countryId = view.countryId;
                }
            });

            view.needImport = view.simulation.get('Status__c') == 'Refresh' && view.simulation.get('Step__c') == 1;
            view.needDelete = view.simulation.get('Status__c') == 'Refresh' && view.simulation.get('Step__c') == 1;

            view.displayMode = options.displayMode;
            view.isPopup = options.isPopup;
            view.countryId = options.countryId;
            var countryId = view.countryId ? view.countryId : view.simulation.get('MnCountry__c');

            view.model = new MnCountryModel({countryId: countryId});
            view['changeCountryId'+view.cid] = function () {
                view.prevCountryId = view.model.previous("countryId");
                view.onCountryChange();
            };
            view.model.on('change:countryId',view['changeCountryId'+view.cid]);

            view.rules = new MnAdvSimulationRuleCollection([], {
                countryId: countryId,
                simulationId: view.simulation.get('Id')
            });
            view['changeRules'+view.cid] = function (e) {
                if(view.threatFactorInited > 0 && e.changed['ReferenceThreatFactor__c']){
                    view.threatFactorInited--;
                    return;
                }
                view.dirty = true;
                view.$el.find('.MnAddRule-Tab').addClass('slds-hide');
                view.$el.find('.MnSaveRule-Tab').removeClass('slds-hide');
                var spanHTML = view.$el.find('.MnAdvSetupRules-Tab.slds-active>a>span').html();
                if (spanHTML) {
                    spanHTML = spanHTML.replace(/ \*/g, '');
                    spanHTML += ' *';
                    view.$el.find('.MnAdvSetupRules-Tab.slds-active>a>span').html(spanHTML);
                }
            };
            view.rules.on('change', view['changeRules'+view.cid]);
            view.rules.on('add', view['changeRules'+view.cid]);

            if (view.countryId === null) {
                view.country = new Backbone.Model(view.simulation.get('MnCountry__r'));
            } else if (view.countryId !== null && options.isPopup) {
                view.country = options.country;
                view.simulation.rules = view.rules;
                view.rules.simulationId = view.simulation.get('Id');
                view.rules.countryId = view.countryId;
            }
            this.initCountriesModel();
            // Backbone.on('saveCountryRules',view.save,this);
            Backbone.on('loadReferencedByCountries', view.reLoadReferencedByCountries, view);
        },


        remove: function() {
            var view = this;
            view.model.off('change:countryId',view['changeCountryId'+view.cid]);
            delete view['changeCountryId'+view.cid];
            view.rules.off('change', view['changeRules'+view.cid]);
            view.rules.off('add', view['changeRules'+view.cid]);
            delete view['changeRules'+view.cid];
            Backbone.off('loadReferencedByCountries', view.reLoadReferencedByCountries);
            MnWizardStep.prototype.remove.apply(this, arguments);
        },

        //Render - called when rendering the view
        render: function () {
            log.debug('MnAdvSetupRulesView.render()');
            var view = this;
            if(view.needDelete) {
                view.deleteRules();
                return;
            }

            if(view.needImport) {
                view.importRules();
                return;
            }

            //if displayMode is Edit then first load the countries and then load the rules
            //In case of Popup, don't display country drop-down also don't process remote action to load countries
            if (!view.isPopup && !view.loadedCountries) {
                view.getCountries();
                return;
            }

            if (!view.loadedRules) {
                view.oldRules = view.rules.clone();
                view.getRules();
                return;
            }

            view.renderRules();
            if (!view.isPopup) {
                view.renderCountries();
            }

            return this;
        },

        initCountriesModel: function () {
            if (typeof this.countries === 'undefined' || this.countries === null) {
                this.countries = new MnCountryCollection([],
                    {
                        api: 'loadSimulationOverviewCountries'
                    });
            }
        },

        renderCountries: function () {
            var view = this;
            view.countryPickList.setElement(view.$el.find('.country-div'));
            view.countryPickList.render();
        },

        getRules: function () {
            var view = this;
            appRouter.showLoading();
            view.rules.fetch({
                simulationId: view.simulation.get('Id'),
                success: function (m, r, o) {
                    console.log('koasd');
                    view.loadedRules = true;
                    view.threatFactorInited = r.length;
                    if(view.oldRules){
                       // var dirtyRule = view.oldRules.models[view.oldRules.length-1];
                        _.each(view.oldRules.models, function (rule, index) {
                            if (!rule.id) {
                                view.rules.push(rule);
                                view.rules.length += 1;
                                view.oldRules = undefined;
                            }
                        });

                    }
                    // view.isDelete =false;
                    view.tabIndex = view.validateTabIndex(view.tabIndex);
                    view.render();
                    appRouter.hideLoading();
                },
                error: function (m, r, o) {
                    appRouter.hideLoading();
                    appRouter.showError('Failed to load country rules.', r.message, r);
                }
            });

        },

        renderRules: function () {
            var view = this;

            _.each(view.subviews, function (subview) {
                subview.remove();
            });
            view.subviews = [];
            var indexed = 1;
            if (view.rules.length > 0) {
                view.dirty = false;
                view.rules.each(function (rule, index) {
                    rule.set('index', indexed++, {silent:true});
                    view.subviews.push(new MnAdvSetupRuleView({
                        isPopup: view.isPopup,
                        rule: rule,
                        simulation: view.simulation,
                        displayMode: view.displayMode
                    }));
                    if (!rule.id || rule.dirty()) {
                        view.dirty = true;
                    }
                });

                view.$el.html(view.template({
                    isPopup: view.isPopup,
                    rules: view.rules.toJSON(),
                    selectedRuleIndex: view.tabIndex,
                    displayMode: view.displayMode,
                    dirty: view.dirty,
                    showDelete: view.rules.size() > 1 && view.displayMode === 'create'
                }));

                view.initSLDSTabsOverride();

                _.each(view.subviews, function (subview, index) {
                    subview.setElement(view.$el.find('.MnAdvSetupRules-Tab-' + index));
                    subview.render();
                });
            } else {
                view.$el.html(view.template({
                    rules: view.rules.toJSON(),
                    isPopup: view.isPopup,
                    country: view.country ? view.country.toJSON() : null,
                    displayMode: view.displayMode
                }));

                view.countryReferenceView = new MnAdvSetupCountryReferencesView({
                    simulation: view.simulation,
                    displayMode: view.displayMode,
                    isPopup: view.isPopup ? view.isPopup : false,
                    country: view.country ? view.country.toJSON() : null
                });
                view.countryReferenceView.setElement(view.$el.find('.countryReferenceView'));
                view.countryReferenceView.render();
            }
        },

        onCountryChange: function () {
            var view = this;
            var country = view.model.get('countryId');
            if (country !== null) {
                view.checkDirtyData(function() {
                    view.model.set({'countryId':country});
                    view.rules.countryId = country;
                    var result = $.grep(view.countries.models, function (e) {
                        return e.get('Id') === country;
                    });
                    if(result.length>0){
                        view.country = result[0];
                    }
                    view.dirty = false;
                    view.getRules();

                });
            } else {
                view.model.set({'countryId': null});
            }
        },

        onSaveRules: function (e) {
            if (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }

            var view = this;
            var country = view.model.get('countryId');
            if (country !== null && view.validate()) {
                appRouter.showLoading();
                view.rules.save({
                    success: function (m, r, o) {
                        appRouter.hideLoading();
                        view.model.set({'countryId': country});
                        view.rules.countryId = country;
                        var result = $.grep(view.countries.models, function (e) {
                            return e.get('Id') === country;
                        });
                        if (result.length > 0) {
                            view.country = result[0];
                        }
                        view.dirty = false;
                        view.getRules();
                    },
                    error: function (m, r, o) {
                        appRouter.hideLoading();
                        appRouter.showError('Failed to save simulation.', r.message, r);
                    }
                });
            }
        },

        checkDirtyData: function (callback) {
            if (this.dirty) {
                appRouter.showConfirm({
                    title: 'You have unsaved changes',
                    message: $Label.GPM_BackWarning,
                    confirm: callback,
                    cancel: function() {
                        this.__revertCountrySelection();
                    }.bind(this)
                });
            } else {
                callback();
            }
        },

        __revertCountrySelection: function () {
            var view = this;
            view.model.set('countryId', view.prevCountryId, {silent: true});
            $('[name="countryId"]').val(view.prevCountryId).attr("selected", "selected");
            view.$el.find('[name="countryId"]').trigger('chosen:updated');
        },

        reLoadReferencedByCountries: function () {
            var view = this;
            if (view.rules.length > 0) {
                _.each(view.subviews, function (subview, index) {
                    if (subview.subviews && subview.subviews.length > 1) {
                        subview.subviews[2].loadReferencedByCountries();
                    }
                });
            }
        },
        //Validate - called when wizard moves to next step
        validate: function () {
            var validateFlag = true;
            var view = this;
            _.each(view.subviews, function (subview, index) {
                if (validateFlag && !subview.validate()) {
                    validateFlag = false;
                }
            });
            return validateFlag;
        },

        confirmStepChange: function() {
            var view = this;
            if (view.hasUnsavedRules()) {
                if (confirm($Label.GPM_BackWarning)) {
                    view.deleteNewUnsavedRule(0);
                    return this.CONFIRM_NEXT_STEP.OK_NOSAVE;
                } else {
                    return this.CONFIRM_NEXT_STEP.CANCEL;
                }
            }
            return this.CONFIRM_NEXT_STEP.OK;
        },

        confirmClose: function(){
            return this.confirmStepChange();
        },


        save: function (callback) {
            var view = this;
            if (view.rules.length > 0) {
                appRouter.showLoading();
                view.rules.save({
                    success: function (m, r, o) {
                        if (callback) callback();
                        view.render();
                        appRouter.hideLoading();
                    },
                    error: function (m, r, o) {
                        appRouter.hideLoading();
                        appRouter.showError('Failed to save simulation.', r.message, r);
                    }
                });
            } else if (callback) {
                callback();
            }
        },

        complete: function (callback) {
            var view = this;
            view.loadedRules = false; //when click back from future steps, need to fetch the rules. RGPM-3006
            appRouter.showLoading();
            view.rules.save({
                success: function (m, r, o) {
                    callback();
                    appRouter.hideLoading();
                },
                error: function (m, r, o) {
                    appRouter.hideLoading();
                    appRouter.showError('Failed to save simulation.', r.message, r);
                }
            });
        },
        // load the list of available countries
        getCountries: function () {
            var view = this;
            view.options = [];
            appRouter.showLoading();
            view.countries.fetch({
                simulationId: view.simulation.get('Id'),
                success: function (m, r, o) {
                    view.loadedCountries = true;
                    if(!view.countryId && view.simulation.get('MnCountry__c')){
                        view.countryId = view.simulation.get('MnCountry__c');
                        view.model.set({'countryId':view.countryId});
                    }
                    /*Sorting the Countries based on Name*/
                    r.sort(function (a, b) {
                        var cName1 = a.Name.toUpperCase();
                        var cName2 = b.Name.toUpperCase();
                        return (cName1 < cName2) ? -1 : (cName1 > cName2) ? 1 : 0;
                    });
                    /* create picklist options */
                    _.each(r, function (country, index) {
                        //PIS: get the first country name to be shown in the drop down
                        if (index === 0 && view.countryId === null) {
                            view.countryId = country.Id;
                        }
                        view.options.push({
                            label: country.Name,
                            value: country.Id
                        });
                    });

                    /* create picklist */
                    view.countryPickList = new MnPickListView({
                        model: view.model,
                        showLabel: false,
                        options: view.options,
                        object: 'MnCountry__c',
                        field: 'countryId'
                    });
                    view.getRules();
                    appRouter.hideLoading();
                },
                error: function (m, r, o) {
                    appRouter.hideLoading();
                    appRouter.showError('Failed to load countries.', r.message, r);
                }
            });
        },

        onAddRule: function (e) {
            if (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
            var view = this;
            log.debug('MnAdvSetupRulesView.onAddRule()');

            view.save(function () {
                appRouter.showLoading();
                view.rules.createNewRuleForCountry({
                    success: function (c, r, o) {
                        log.debug('MnAdvSetupRulesView.onAddRule() - success');
                        view.tabIndex = view.rules.length - 1;
                        view.render();
                        appRouter.hideLoading();
                    },
                    error: function (c, r, o) {
                        log.debug('MnAdvSetupRulesView.onAddRule() - error');
                        appRouter.hideLoading();
                        appRouter.showError('Failed to add rule.', r.message, r);
                    }
                });
            });
        },

        onDeleteRule: function (e) {
            if (e) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
            var view = this;
            var index = $(e.currentTarget).attr('tabindex');
            var ruleToDelete = view.rules.at(index);

            if((view.dirty || view.hasUnsavedRules()) && !ruleToDelete.dirty()){
                view.showPopupMessage({
                    message:'Delete Rule',
                    detail:'You have unsaved changes. Please, save them before deleting.'
                });
                return;
            }
            // view.isDelete = true;

            log.debug('MnAdvSetupRulesView.onDeleteRule()');
            appRouter.showLoading();
            if (ruleToDelete.get('Id')) {
                view.rules.deleteRules({
                    rules: [ruleToDelete],
                    success: function (c, r, o) {
                        log.debug('MnAdvSetupRulesView.onDeleteRule() - success');
                        view.tabIndex = view.validateTabIndex(view.tabIndex < index ? view.tabIndex : --view.tabIndex);
                        view.render();
                        appRouter.hideLoading();
                    },
                    error: function (c, r, o) {
                        log.debug('MnAdvSetupRulesView.onDeleteRule() - error');
                        appRouter.hideLoading();
                        appRouter.showError('Failed to delete rule.', r.message, r);
                    }
                });
            } else {
                view.deleteNewUnsavedRule(index);
                appRouter.hideLoading();
            }
        },

        deleteNewUnsavedRule: function(index){
            var view = this;
            view.loadedRules = false;
            view.tabIndex = view.validateTabIndex(view.tabIndex < index ? view.tabIndex : --view.tabIndex);
            view.rules.models = _.filter(view.rules.models, function(rule) {
                return rule.id;
            });
            view.render();
        },

        validateTabIndex: function(tabIndex) {
            tabIndex = tabIndex >= this.rules.length ? this.rules.length - 1 : tabIndex;
            tabIndex = tabIndex < 0 ? 0 : tabIndex;
            return tabIndex;
        },

        showPopupMessage: function(messageData){
            var dialog = new MnMessageView(messageData);
            this.$el.parent().append(dialog.$el);
            dialog.render();
        },

        hasUnsavedRules: function(){
            return _.find(this.rules.models, function(item){return item.dirty();});
        },

        importRules: function () {
            var view = this;
            appRouter.showLoading();
            MnAdvSimulationRemoteActions.importRules(
                view.simulation.get('Id'),
                function (m, r, o) {
                    view.needImport = false;
                    view.render();
                    appRouter.hideLoading();
                },
                function (m, r, o) {
                    appRouter.hideLoading();
                    appRouter.showError('Failed to import country rules.', r.message, r);
                }
            );
        },

        deleteRules: function () {
            var view = this;
            appRouter.showLoading();
            MnAdvSimulationRemoteActions.deleteRules(
                view.simulation.get('Id'),
                function (m, r, o) {
                    view.needDelete = false;
                    view.render();
                    appRouter.hideLoading();
                },
                function (m, r, o) {
                    appRouter.hideLoading();
                    appRouter.showError('Failed to delete country rules.', r.message, r);
                }
            );
        }
    });
    export default v;
