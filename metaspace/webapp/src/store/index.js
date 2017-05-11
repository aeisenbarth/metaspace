import Vue from 'vue';
import Vuex from 'vuex';
Vue.use(Vuex);

import getters from './getters.js';
import mutations from './mutations.js';

const store = new Vuex.Store({
  state: {
    // names of currently shown filters
    orderedActiveFilters: [],

    // currently selected annotation
    annotation: undefined,

    // is annotation table loading?
    tableIsLoading: true,

    lastUsedFilters: {},

    authenticated: false,
    user: null,

    currentTour: null,
  },

  getters,
  mutations
})

export default store;
