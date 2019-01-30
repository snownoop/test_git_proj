// @flow
import 'babel-polyfill';
import * as React from 'react';
import { connect } from 'react-redux';
import { TableWrapper } from 'react-lightning-design-system';
import classnames from 'classnames';
import type { inputValueType } from 'base/constants/flowTypes';
import type { dispatchType as appDispatchType } from 'base/actions/appActions';
import type { dispatchType as productDispatchType } from '../actions/index';
import { t } from 'base/utils/i18n';
import { format } from 'base/utils/utils';
import {
  mapReimbursementData,
  mapReimbursementMeta,
  mapSelectedReimbursementForEdit,
  mapSortColumn,
} from '../utils/utils';
import ReimbursementDetails from './ReimbursementDetails';
import { TABLE_LOCK_COLUMNS_COUNT } from '../constants/constants';
import type { fieldsetItemType, reimbursementsType } from '../constants/flowTypes';

type propsType = {
  // TODO snownoop check why productDispatchType | appDispatchType is not working
  dispatch: productDispatchType,
  reimbursements: reimbursementsType,
  fieldset: Array<fieldsetItemType>,
  editable: boolean,
  toggleAddReimbursementModal: Function,
  getAllReimbursements: Function,
};

type stateType = {
  isTableViewType?: boolean,
  selectedReimbursement?: ?string,
  selectedRow?: ?number,
};

const mapStateToProps = state => ({
  reimbursements: state.reducer.reimbursements,
  fieldset: state.reducer.tableFieldset,
  editable: state.reducer.editable,
});

const TABLE_ROW_HEIGHT = 27;

function renderHeaderCell(item: { label: string, truncate: boolean }) {
  const spanClassNames = classnames({
    'slds-truncate': item.truncate,
  });
  return (
    <span className={spanClassNames} title={item.label}>
      {item.label}
    </span>
  );
}

function getProductSkuCellValue(meta, data) {
  const val = data[meta.name];
  if (!val) {
    return t('all');
  }
  return val;
}

@connect(mapStateToProps)
class ReimbursementTable extends React.Component<propsType, stateType> {
  static defaultProps = {
    dispatch: () => {},
    reimbursements: [],
    fieldset: [],
    editable: false,
  };

  state = {
    isTableViewType: true,
    selectedReimbursement: null,
    selectedRow: null,
  };

  componentDidMount() {
    window.addEventListener(
      'resizeReimbursementContainer',
      this.tableRef && this.tableRef.onUpdateLayout,
    );
  }

  componentWillUnmount() {
    window.removeEventListener(
      'resizeReimbursementContainer',
      this.tableRef && this.tableRef.onUpdateLayout,
    );
  }

  async onSortChange(options: { direction: string, column: string }) {
    const { dispatch, getAllReimbursements } = this.props;
    dispatch(GPMApp.appActions.showAppSpinner(true));
    await getAllReimbursements({
      sortAscending: options.direction,
      sortColumn: mapSortColumn(options.column),
    });
    dispatch(GPMApp.appActions.showAppSpinner(false));
  }

  onFormatValue = (
    value: inputValueType,
    formatString: ?string,
    type: string,
  ) => {
    if (!value) return value;
    return format(type, value);
  }

  toggleTableView = (index?: number, selected?: string) => {
    const { selectedReimbursement } = this.state;
    const newState: stateType = { selectedRow: index };
    if (selected && selected !== selectedReimbursement) {
      newState.selectedReimbursement = selected;
      if (!selectedReimbursement) {
        newState.isTableViewType = !this.state.isTableViewType;
      }
    } else {
      newState.isTableViewType = !this.state.isTableViewType;
      newState.selectedReimbursement = null;
    }
    this.setState(newState);
  }

  getActions() {
    const { editable, toggleAddReimbursementModal } = this.props;
    const actions = [];
    if (editable) {
      actions.push({
        label: t('addReimbursement'),
        type: 'always',
        onClick: () => toggleAddReimbursementModal(true),
      });
    }
    return actions;
  }

  tableRef: ?TableWrapper;

  render() {
    const { reimbursements, fieldset, getAllReimbursements } = this.props;
    const { isTableViewType, selectedReimbursement, selectedRow } = this.state;
    const meta = mapReimbursementMeta(fieldset);
    const data = mapReimbursementData(reimbursements, meta, fieldset);
    const actions = this.getActions();
    return (
      <div>
        <TableWrapper
          id="reimbursementsTable"
          ref={(node) => {
            this.tableRef = node;
          }}
          noRowHover
          fixedHeaders
          sortable
          bordered
          hideTableViewTypeButton
          rowHeight={TABLE_ROW_HEIGHT}
          fixedColumns={TABLE_LOCK_COLUMNS_COUNT}
          splitterLeftWidth={500}
          hideNoData={false}
          data={data}
          meta={meta}
          actions={actions}
          viewType={isTableViewType ? 'table' : 'detailView'}
          onRowClick={index => this.toggleTableView(index, data[index].Id)}
          detailsViewSelectedIndex={selectedRow}
          onSortChange={options => this.onSortChange(options)}
          onFormatValue={this.onFormatValue}
          headerRenderer={renderHeaderCell}
          detailsViewRenderer={() => (
            <ReimbursementDetails
              data={mapSelectedReimbursementForEdit(
                selectedReimbursement,
                reimbursements,
                fieldset,
              )}
              getAllReimbursements={getAllReimbursements}
              toggleTableView={this.toggleTableView}
              tableRef={this.tableRef}
            />
          )}
        />
      </div>
    );
  }
}

export default ReimbursementTable;
